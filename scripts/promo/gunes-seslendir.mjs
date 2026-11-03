/**
 * Güneş tanıtım videosu için ElevenLabs seslendirmesi (kendi bilgisayarınızda çalışır).
 *
 * 1) Güneş klasöründeki .env dosyasına ekleyin:   ELEVENLABS_API_KEY=...
 *    (Anahtar: elevenlabs.io → Profile → API Keys. Sohbete yapıştırmayın.)
 * 2) Güneş klasöründe çalıştırın:
 *    (Şirket ağında SSL denetimi varsa --use-system-ca gerekir.)
 *      node --use-system-ca scripts/promo/gunes-seslendir.mjs --list   (ÜCRETSİZ olanlar API ile kullanılabilir)
 *      node --use-system-ca scripts/promo/gunes-seslendir.mjs --dene   (her ücretsiz kadın sesiyle kısa deneme; 'hepsi' ile erkekler de)            (kullanabileceğiniz sesleri listeler)
 *      node --use-system-ca scripts/promo/gunes-seslendir.mjs   (varsayılan sesle seslendirir)
 *      node --use-system-ca scripts/promo/gunes-seslendir.mjs <voice_id>        (seçtiğiniz sesle)
 * 3) Oluşan "seslendirme" klasöründeki tüm dosyaları sohbete yükleyin.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const KEY = process.env.ELEVENLABS_API_KEY || /^ELEVENLABS_API_KEY=(.+)$/m.exec(env)?.[1]?.trim();
if (!KEY) { console.error('ELEVENLABS_API_KEY bulunamadı (.env dosyasına ekleyin).'); process.exit(1); }
const H = { 'xi-api-key': KEY, 'content-type': 'application/json' };

async function voices() {
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: H });
  const j = await r.json();
  if (!r.ok) { console.error(j); process.exit(1); }
  // "premade" = ElevenLabs'in hazır sesleri; ücretsiz planda API ile kullanılabilir
  return j.voices.sort((x, y) => (x.category === 'premade' ? 0 : 1) - (y.category === 'premade' ? 0 : 1));
}

if (process.argv[2] === '--list') {
  for (const v of await voices()) {
    const free = v.category === 'premade' ? 'ÜCRETSİZ' : 'ücretli olabilir';
    console.log(`${v.voice_id}  ${v.name.padEnd(26)} ${String(v.labels?.gender ?? '').padEnd(7)} ${String(v.labels?.age ?? '').padEnd(12)} ${free}`);
  }
  process.exit(0);
}

if (process.argv[2] === '--dene') {
  // Her ücretsiz kadın sesiyle kısa bir deneme (yaklaşık 80 karakter/ses)
  const list = (await voices()).filter((v) => v.category === 'premade' && (process.argv[3] === 'hepsi' || v.labels?.gender === 'female'));
  mkdirSync('seslendirme/deneme', { recursive: true });
  for (const v of list) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}?output_format=mp3_44100_128`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ text: 'Bu, Güneş, kendi yapay zekâ asistanım. Her sabah beni karşılıyor.', model_id: 'eleven_multilingual_v2' }),
    });
    if (!r.ok) { console.log(`${v.name}: atlandı (${r.status})`); continue; }
    const file = `seslendirme/deneme/${v.name.replace(/[^\w-]+/g, '_')}_${v.voice_id}.mp3`;
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    console.log('✓', file);
  }
  console.log('\nDinleyip beğendiğinizin kimliğiyle çalıştırın:  node --use-system-ca scripts/promo/gunes-seslendir.mjs <voice_id>');
  process.exit(0);
}

const VOICE = process.argv[2] || 'cbqdgvVi3C6sgxIWpqIh'; // Yıldıray Bey'in seçtiği ses
const MODEL = process.env.EL_MODEL || 'eleven_multilingual_v2';
const SCRIPT = [
 {
  "id": "intro",
  "text": "Bu, Güneş, kendi yapay zekâ asistanım. Her sabah beni karşılıyor, Outlook'umu ve Teams'imi takip ediyor, işlerimi panoda tutuyor."
 },
 {
  "id": "voice",
  "text": "Günün ilk açılışında brifingi sesli okuyor. Önemli maddelerde soru soruyor; evet, sonra ya da geç diyerek cevap veriyorum."
 },
 {
  "id": "brief",
  "text": "Brifing ekranında günün toplantıları, öncelikli işler ve cevap bekleyenler var. Toplantıdan on beş dakika önce de bir hazırlık notu geliyor."
 },
 {
  "id": "board",
  "text": "Gelen mailler ve Teams mesajları karta dönüşüyor. Güneş işleri ilerletiyor; ama bir işin bittiğine her zaman ben karar veriyorum."
 },
 {
  "id": "card",
  "text": "Her kartta orijinal alıntı, kaynak mesaj ve yapılan her değişiklik saklanıyor."
 },
 {
  "id": "chat",
  "text": "Sohbette mailimi arıyor, farkları tabloya döküyor ve cevap taslağını hazırlıyor. Göndermiyor; son kontrol bende."
 },
 {
  "id": "wiki",
  "text": "Projeler ve kişiler için kendi wiki'sini yazıyor. Zamanla birlikte çalıştığım insanları tanıyor."
 },
 {
  "id": "memory",
  "text": "Bir hafızası ve ruhu var. Geri bildirimlerimden öğreniyor, her hafta da kendini gözden geçiriyor."
 },
 {
  "id": "weekly",
  "text": "Cuma öğleden sonra haftalık raporu hazırlıyor: kapanan, ilerleyen ve risk taşıyan işler."
 },
 {
  "id": "farewell",
  "text": "Akşam bugünlük yeter dediğimde günün özetini, yarını ve havayı gösteriyor. Günlüğünü yazıp kapanıyor."
 },
 {
  "id": "agents",
  "text": "Arka planda bir ajan ekibi çalışıyor. Toplayıcı ajan, hızlı ve ekonomik Haiku beş nokta beş ile Outlook'u ve Teams'i tarıyor. Planlayıcı, toplantı ve sohbet ajanları Sonnet beş nokta beş ile düşünüyor. Hepsi Claude üyeliğimle çalışıyor; ayrı bir A-P-İ anahtarı yok ve tüm veriler Supabase'de kalıcı."
 },
 {
  "id": "end",
  "text": "Güneş. Her sabah işimin başında, her akşam günümün sonunda."
 }
];

mkdirSync('seslendirme', { recursive: true });
let total = 0;
for (const s of SCRIPT) {
  process.stdout.write(`${s.id} … `);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      text: s.text,
      model_id: MODEL,
      language_code: MODEL.includes('multilingual_v2') ? undefined : 'tr',
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed: 1.0 },
    }),
  });
  const j = await r.json();
  if (!r.ok) { console.error('\nHata:', JSON.stringify(j)); process.exit(1); }
  writeFileSync(`seslendirme/${s.id}.mp3`, Buffer.from(j.audio_base64, 'base64'));
  writeFileSync(`seslendirme/${s.id}.json`, JSON.stringify({ text: s.text, alignment: j.alignment }));
  total += s.text.length;
  console.log('tamam');
}
console.log(`\nBitti: ${SCRIPT.length} parça, ${total} karakter. "seslendirme" klasöründeki dosyaları sohbete yükleyin.`);
