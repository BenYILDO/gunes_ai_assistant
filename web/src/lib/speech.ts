const KEY = 'gunes.voice';

export const voiceEnabled = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};
export const setVoiceEnabled = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* yoksay */
  }
};

/** Tarayıcının kendi Türkçe sesiyle konuşur (internet/API gerekmez). */
export function speak(text: string) {
  if (!voiceEnabled() || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  const go = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('tr'));
    // Windows'ta "Microsoft Emel Online (Natural)" gibi doğal sesler varsa onları tercih et
    u.voice = voices.find((v) => /natural|online|emel/i.test(v.name)) ?? voices[0] ?? null;
    u.rate = 1.02;
    u.pitch = 1.05;
    synth.cancel();
    synth.speak(u);
  };
  if (synth.getVoices().length) go();
  else synth.addEventListener('voiceschanged', go, { once: true });
}
