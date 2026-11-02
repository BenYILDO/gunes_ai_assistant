/**
 * Güneş'in kendiliğinden seslenmesi ("dürtme"):
 * Planlayıcı kayda değer bir gelişme görünce bir sohbet başlatır (ilk mesaj Güneş'ten).
 * Arayüz açıksa köşede pop-up, kapalıysa Windows bildirimi gösterilir.
 */
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { getStore, type Store } from './store/index.js';

const KEY = 'nudges_unseen';
export const NUDGE_PREFIX = '☀️ ';

export async function unseenIds(store: Store = getStore()): Promise<string[]> {
  try {
    return JSON.parse((await store.getState(KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export async function createNudge(store: Store, title: string, message: string) {
  const session = await store.createChatSession(crypto.randomUUID(), `${NUDGE_PREFIX}${title}`.slice(0, 80));
  await store.addChatMessage({ session_id: session.id, role: 'assistant', content: message, tools: [] });
  const ids = await unseenIds(store);
  await store.setState(KEY, JSON.stringify([...ids, session.id].slice(-20)));
  return session;
}

export async function listUnseen(store: Store = getStore()) {
  const ids = await unseenIds(store);
  const out = [];
  for (const id of ids) {
    const s = await store.getChatSession(id);
    if (!s) continue;
    const first = (await store.listChatMessages(id))[0];
    out.push({ id: s.id, title: s.title.replace(NUDGE_PREFIX, ''), message: first?.content ?? '', created_at: s.created_at });
  }
  return out;
}

export async function markSeen(id: string, store: Store = getStore()) {
  const ids = await unseenIds(store);
  await store.setState(KEY, JSON.stringify(ids.filter((x) => x !== id)));
}

// ---------------------------------------------------------------- Arayüz görünür mü?
let lastVisibleAt = 0;
export const markPresence = (visible: boolean) => {
  if (visible) lastVisibleAt = Date.now();
};
export const uiVisible = () => Date.now() - lastVisibleAt < 90_000;

// ---------------------------------------------------------------- Windows bildirimi
const xmlEsc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** Windows'un kendi bildirim sistemiyle (ek modül gerektirmez) masaüstü bildirimi gösterir. */
export function desktopToast(title: string, body: string, sessionId?: string) {
  if (process.platform !== 'win32') return;
  const url = `http://localhost:${config.port}/?intro=0${sessionId ? `&chat=${sessionId}` : ''}`;
  const xml = `<toast activationType="protocol" launch="${xmlEsc(url)}"><visual><binding template="ToastGeneric"><text>${xmlEsc(`☀️ ${title}`)}</text><text>${xmlEsc(body.slice(0, 220))}</text></binding></visual><actions><action content="Konuşalım" activationType="protocol" arguments="${xmlEsc(url)}"/></actions></toast>`;
  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$x = New-Object Windows.Data.Xml.Dom.XmlDocument
$x.LoadXml([Console]::In.ReadToEnd())
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))
`;
  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => undefined);
    child.stdin.end(xml, 'utf8');
  } catch {
    /* bildirim gösterilemezse sessizce geç */
  }
}

/** Bir çalışmadan sonra yeni dürtmeler varsa ve arayüz görünmüyorsa masaüstü bildirimi gönder. */
export async function announceNew(before: string[]) {
  const store = getStore();
  const now = await unseenIds(store);
  const fresh = now.filter((id) => !before.includes(id));
  if (!fresh.length || uiVisible()) return;
  const list = await listUnseen(store);
  const first = list.find((n) => n.id === fresh[0]);
  if (!first) return;
  desktopToast(fresh.length > 1 ? `${first.title} (+${fresh.length - 1})` : first.title, first.message, first.id);
}
