/**
 * Resmi `claude` CLI'ını (Claude Code) başlatan köprü.
 * Kimlik doğrulama bilgisayarınızdaki Claude Code girişinden (Pro üyeliğiniz) gelir;
 * Güneş hiçbir API anahtarı veya oturum belirteci okumaz.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  config,
  DATA_DIR,
  gunesTool,
  m365,
  M365_DRAFT_TOOLS,
  M365_FORBIDDEN_TOOLS,
  M365_READ_TOOLS,
  ROOT,
} from '../config.js';

export const AGENT_HOME = join(DATA_DIR, 'agent-home');
if (!existsSync(AGENT_HOME)) mkdirSync(AGENT_HOME, { recursive: true });

/**
 * Güneş MCP sunucusunun başlatma tanımı (derlenmiş ya da geliştirme modunda).
 * --use-system-ca: kurumsal ağlarda (SSL denetimi) Windows'un güvendiği sertifikaları kullan.
 */
export function gunesMcpServerDef() {
  const isDev = fileURLToPath(import.meta.url).endsWith('.ts');
  return isDev
    ? { command: process.execPath, args: ['--use-system-ca', '--import', 'tsx', join(ROOT, 'server', 'src', 'mcp.ts')], cwd: ROOT }
    : { command: process.execPath, args: ['--use-system-ca', join(ROOT, 'server', 'dist', 'mcp.js')], cwd: ROOT };
}

let mcpConfigPath: string | null = null;
function mcpConfig() {
  if (!mcpConfigPath) {
    mcpConfigPath = join(DATA_DIR, 'mcp-config.json');
    writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: { gunes: gunesMcpServerDef() } }, null, 2));
  }
  return mcpConfigPath;
}

export type ToolPreset = 'collector' | 'planner' | 'chat' | 'notifier' | 'none';

/** Güneş MCP sunucusunun tüm araçları */
const GUNES_ALL = 'mcp__gunes';
/** Her ön ayar için izin verilen / yasaklanan araçlar. */
export function toolPreset(preset: ToolPreset) {
  const read = M365_READ_TOOLS.map(m365);
  const forbidden = [...M365_FORBIDDEN_TOOLS.map(m365), 'Bash', 'PowerShell', 'Edit', 'Write', 'NotebookEdit'];
  switch (preset) {
    case 'collector':
      return {
        builtins: '',
        allowed: [...read, gunesTool('record_events'), gunesTool('search_events')],
        disallowed: [...forbidden, ...M365_DRAFT_TOOLS.map(m365), m365('teams_send_chat_message')],
      };
    case 'planner':
      return {
        builtins: '',
        allowed: [GUNES_ALL],
        disallowed: [...forbidden, ...M365_DRAFT_TOOLS.map(m365), m365('teams_send_chat_message')],
      };
    case 'chat':
      return {
        builtins: 'WebSearch,WebFetch',
        allowed: [...read, ...M365_DRAFT_TOOLS.map(m365), GUNES_ALL, 'WebSearch', 'WebFetch'],
        disallowed: [...forbidden, m365('teams_send_chat_message')],
      };
    case 'notifier':
      return {
        builtins: '',
        allowed: [m365('teams_send_chat_message')],
        disallowed: forbidden,
      };
    default:
      return { builtins: '', allowed: [], disallowed: forbidden };
  }
}

export interface RunOptions {
  prompt: string;
  model: string;
  preset: ToolPreset;
  appendSystemPrompt?: string;
  /** Yeni sohbet için sabit oturum kimliği */
  sessionId?: string;
  /** Var olan sohbete devam */
  resume?: string;
  persist?: boolean;
  timeoutMs?: number;
  onEvent?: (e: RunnerEvent) => void;
  signal?: AbortSignal;
}

export type RunnerEvent =
  | { type: 'init'; sessionId: string; mcp: { name: string; status: string }[]; tools: string[] }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'result'; text: string; isError: boolean; costUsd?: number; turns?: number };

export interface RunResult {
  text: string;
  isError: boolean;
  sessionId: string | null;
  tools: string[];
  costUsd?: number;
  stderr: string;
}

const quoteWin = (a: string) => (a === '' || /[\s"&|<>^(),]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);

export function runClaude(opts: RunOptions): Promise<RunResult> {
  const tp = toolPreset(opts.preset);
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model',
    opts.model,
    '--mcp-config',
    mcpConfig(),
    '--permission-mode',
    'dontAsk',
    '--tools',
    tp.builtins,
  ];
  if (tp.allowed.length) args.push('--allowedTools', tp.allowed.join(','));
  if (tp.disallowed.length) args.push('--disallowedTools', tp.disallowed.join(','));
  if (opts.appendSystemPrompt) args.push('--append-system-prompt', opts.appendSystemPrompt);
  if (opts.resume) args.push('--resume', opts.resume);
  else if (opts.sessionId) args.push('--session-id', opts.sessionId);
  if (!opts.persist) args.push('--no-session-persistence');

  const isWin = process.platform === 'win32';
  const useShell = isWin && !/\.exe$/i.test(config.claudeBin);
  const child = spawn(config.claudeBin, useShell ? args.map(quoteWin) : args, {
    cwd: AGENT_HOME,
    shell: useShell,
    windowsHide: true,
    env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'gunes' },
  });

  return new Promise((resolve) => {
    const result: RunResult = { text: '', isError: false, sessionId: null, tools: [], stderr: '' };
    let buf = '';
    let streamed = '';
    const timer = setTimeout(() => {
      result.isError = true;
      result.text ||= 'Zaman aşımı: Claude yanıt vermedi.';
      child.kill();
    }, opts.timeoutMs ?? 15 * 60_000);
    opts.signal?.addEventListener('abort', () => child.kill());

    const handle = (line: string) => {
      if (!line.trim()) return;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.type === 'system' && msg.subtype === 'init') {
        result.sessionId = msg.session_id ?? null;
        opts.onEvent?.({ type: 'init', sessionId: msg.session_id, mcp: msg.mcp_servers ?? [], tools: msg.tools ?? [] });
      } else if (msg.type === 'stream_event') {
        const ev = msg.event;
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && !msg.parent_tool_use_id) {
          streamed += ev.delta.text;
          opts.onEvent?.({ type: 'text', text: ev.delta.text });
        }
      } else if (msg.type === 'assistant') {
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'tool_use') {
            result.tools.push(block.name);
            opts.onEvent?.({ type: 'tool', name: block.name, input: block.input });
          }
        }
      } else if (msg.type === 'result') {
        result.text = typeof msg.result === 'string' && msg.result ? msg.result : streamed;
        result.isError = Boolean(msg.is_error) || msg.subtype !== 'success';
        result.costUsd = msg.total_cost_usd;
        result.sessionId = msg.session_id ?? result.sessionId;
        opts.onEvent?.({
          type: 'result',
          text: result.text,
          isError: result.isError,
          costUsd: msg.total_cost_usd,
          turns: msg.num_turns,
        });
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      buf += d;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        handle(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string) => {
      result.stderr = (result.stderr + d).slice(-4000);
    });
    child.on('error', (err) => {
      result.isError = true;
      result.text = `Claude CLI başlatılamadı (${config.claudeBin}): ${err.message}. 'npm run doctor' ile kontrol edin.`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      handle(buf);
      if (!result.text && streamed) result.text = streamed;
      if (code && code !== 0 && !result.text) {
        result.isError = true;
        result.text = `Claude CLI ${code} koduyla kapandı. ${result.stderr.slice(-800)}`;
      }
      resolve(result);
    });

    child.stdin.end(opts.prompt, 'utf8');
  });
}
