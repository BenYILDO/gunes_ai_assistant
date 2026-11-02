/**
 * Doğal sesli okuma: Azure Speech (ücretsiz F0 katmanı, ayda 500 bin karakter).
 * Ses: tr-TR-EmelNeural. Anahtar yoksa ya da kota dolduysa arayüz tarayıcı sesine döner.
 * Aynı metinler önbellekten verilir (kota tasarrufu); aylık karakter sayacı tutulur.
 */
import { config } from './config.js';
import { getStore } from './store/index.js';

const cache = new Map<string, Buffer>();
const USAGE_KEY = 'tts_usage';
const month = () => new Date().toISOString().slice(0, 7);

export const ttsEnabled = () => Boolean(config.azureSpeechKey && config.azureSpeechRegion);

export async function ttsUsage(): Promise<{ month: string; chars: number; limit: number }> {
  try {
    const v = JSON.parse((await getStore().getState(USAGE_KEY)) ?? '{}');
    return { month: month(), chars: v.month === month() ? Number(v.chars) || 0 : 0, limit: config.ttsMonthlyLimit };
  } catch {
    return { month: month(), chars: 0, limit: config.ttsMonthlyLimit };
  }
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export class TtsError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export async function synthesize(text: string): Promise<Buffer> {
  if (!ttsEnabled()) throw new TtsError('Azure Speech ayarlı değil', 501);
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 3000);
  if (!clean) throw new TtsError('Boş metin', 400);
  const hit = cache.get(clean);
  if (hit) return hit;

  const usage = await ttsUsage();
  if (usage.chars + clean.length > usage.limit) throw new TtsError('Aylık ses kotası doldu', 429);

  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="tr-TR">` +
    `<voice name="${config.ttsVoice}"><prosody rate="${config.ttsRate}" pitch="${config.ttsPitch}">${esc(clean)}</prosody></voice></speak>`;
  const res = await fetch(`https://${config.azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.azureSpeechKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'gunes-assistant',
    },
    body: ssml,
    signal: AbortSignal.timeout(15_000),
  }).catch((e: Error & { cause?: { code?: string } }) => {
    throw new TtsError(`Azure'a ulaşılamadı: ${e.cause?.code ?? e.message}`, 502);
  });
  if (!res.ok) throw new TtsError(`Azure Speech HTTP ${res.status}${res.status === 401 ? ' (anahtar ya da bölge hatalı)' : ''}`, 502);
  const buf = Buffer.from(await res.arrayBuffer());

  cache.set(clean, buf);
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
  await getStore()
    .setState(USAGE_KEY, JSON.stringify({ month: month(), chars: usage.chars + clean.length }))
    .catch(() => undefined);
  return buf;
}
