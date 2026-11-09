import { AnimatePresence, motion, useAnimationControls, useMotionValue, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Pet, type PetItemId, type Today } from '../lib/api';
import {
  BOWL_LINES,
  CARD_LINES,
  DROP_LINES,
  EDGE_LINES,
  EXCITED_LINES,
  FED_LINES,
  HOME_LINES,
  PAT_LINES,
  PLAY_LINES,
  SLEEPY_LINES,
  SLEEP_AGAIN,
  WAKE_LINES,
  pickFrom,
  pickLine,
  type PetCtx,
} from '../lib/pet';
import { alongOf, arcPoint, dropTarget, facingOf, jumpHeight, lerp, patrolFacing, perchTarget, strollTarget, usableCard, walkSeconds } from '../lib/petMotion';
import { Cat, type CatEyes, type CatPose } from './Cat';
import { PetWorld } from './PetWorld';

const POS_KEY = 'gunes.petPos';
const BASE_W = 128;
const BASE_H = 120;
const MARGIN = 20;
const BOTTOM = 56;
const WAKE_MS = 180_000; // çok sevilince uyanık kalma süresi
const EXCITE_MS = 90_000; // uyanıkken çok sevilince hareketli kalma süresi
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

type Kind = 'card' | 'edge';
interface Surface {
  el: HTMLElement;
  kind: Kind;
  rect: DOMRect;
}

const loadPos = () => {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { x: number; y: number } | null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
  } catch {
    /* yoksay */
  }
  return { x: 0, y: 0 };
};
const itemEl = (id: PetItemId) => document.querySelector<HTMLElement>(`[data-pet-item="${id}"]`);

/**
 * Ekranda yaşayan evcil hayvan (kedi/tilki): sürüklenir, sevilir, günde bir kez mama kabına gelip beslenir, gerçek duruma bağlı konuşur,
 * kendi kendine yürür, kartların üstüne zıplayıp yatar, panel çizgilerinde gezinir, minderde dinlenir, yün yumağıyla oynar, geceleri evinde uyur.
 * Bir yüzeyin üstüne bırakılırsa oraya yapışır. Uykudayken sevilirse bir an uyanır; art arda çok sevilirse birkaç dakika uyanık ve hareketli kalır.
 */
export function PetCompanion({
  pet,
  today,
  critical,
  sleeping,
  onBoard,
  free,
  scale,
  onPet,
}: {
  pet: Pet | null;
  today: Today | null;
  critical: number;
  /** Aramadayken / sessiz saatlerde / gece uyur: konuşmaz, yürümez (sevilince uyanabilir) */
  sleeping: boolean;
  /** Pano ekranı açık: kartlara çıkabilir */
  onBoard: boolean;
  /** Üstte pencere/panel yok: yüzeylere çıkılabilir */
  free: boolean;
  /** Boyut çarpanı (0,5–1); değişince bileşen yeniden kurulur (key) */
  scale: number;
  /** Sunucudan gelen güncel durum (besleme, eşya taşıma, sayaçlar) */
  onPet: (p: Pet) => void;
}) {
  const W = BASE_W * scale;
  const H = BASE_H * scale;
  const calm = Boolean(useReducedMotion());
  const x = useMotionValue(loadPos().x);
  const y = useMotionValue(loadPos().y);
  const root = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [bubble, setBubble] = useState<string | null>(null);
  const [happy, setHappy] = useState(false);
  const [eating, setEating] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [pose, setPose] = useState<CatPose>('sit');
  const [facing, setFacing] = useState<1 | -1>(1);
  const [wake, setWake] = useState(false);
  const [inHouse, setInHouse] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; dx: number }[]>([]);
  const hop = useAnimationControls();
  const bubbleTimer = useRef<number | undefined>(undefined);
  const lastLine = useRef<string | null>(null);
  const busy = useRef(false);
  const visiting = useRef(false);
  const playing = useRef(false);
  const perched = useRef<Surface | null>(null);
  const lastEl = useRef<HTMLElement | null>(null);
  const pats = useRef<number[]>([]);
  const patsPending = useRef(0);
  const patsTimer = useRef<number | undefined>(undefined);
  const lively = useRef(false);
  const livelyTimer = useRef<number | undefined>(undefined);
  const poke = useRef<(() => void) | null>(null);
  const flags = useRef({ onBoard, free });
  flags.current = { onBoard, free };
  const petRef = useRef(pet);
  petRef.current = pet;
  const vpRef = useRef(vp);
  vpRef.current = vp;

  const asleep = sleeping && !wake;
  const species = pet?.species ?? 'cat';
  const worn = useMemo(() => ({ hat: pet?.worn.includes('hat'), bow: pet?.worn.includes('bow') }), [pet?.worn]);

  const say = useCallback((text: string, ms = 6500) => {
    setBubble(text);
    lastLine.current = text;
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  const burst = (n = 3) => {
    const base = Date.now();
    setHearts((h) => [...h, ...Array.from({ length: n }, (_, i) => ({ id: base + i, dx: (i - (n - 1) / 2) * 16 + Math.random() * 8 }))]);
    window.setTimeout(() => setHearts((h) => h.filter((x) => x.id < base || x.id >= base + n)), 1300);
  };
  const feelHappy = (ms = 2500) => {
    setHappy(true);
    window.setTimeout(() => setHappy(false), ms);
  };

  // ---------- konum matematiği: kutunun sol-üstü (ekran px) ⇄ sürükleme kaydırması
  const groundTop = () => window.innerHeight - BOTTOM - H;
  const absNow = () => ({ x: MARGIN + x.get(), y: groundTop() + y.get() });
  const setAbs = (ax: number, ay: number) => {
    x.set(ax - MARGIN);
    y.set(ay - groundTop());
  };

  const limits = useMemo(() => ({ left: -MARGIN, right: Math.max(0, vp.w - MARGIN - W), top: -Math.max(0, vp.h - BOTTOM - H), bottom: BOTTOM - 8 }), [vp]);
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    x.set(Math.min(limits.right, Math.max(limits.left, x.get())));
    y.set(Math.min(limits.bottom, Math.max(limits.top, y.get())));
  }, [limits, x, y]);

  // ---------- hareket motoru: iptal edilebilir rAF tween'leri
  const token = useRef(0);
  const stopTween = useRef<(() => void) | null>(null);
  const cancel = useCallback(() => {
    token.current++;
    stopTween.current?.();
    stopTween.current = null;
    perched.current = null;
    setPose('sit');
  }, []);
  /** dur sn boyunca step(t) çağırır; bitince true, iptal edilirse false döner */
  const tween = useCallback((dur: number, step: (t: number) => void) => {
    const my = token.current;
    return new Promise<boolean>((resolve) => {
      let raf = 0;
      const t0 = performance.now();
      stopTween.current = () => {
        cancelAnimationFrame(raf);
        resolve(false);
      };
      const tick = (now: number) => {
        if (token.current !== my) return resolve(false);
        const t = Math.min(1, (now - t0) / 1000 / dur);
        step(t);
        if (t < 1) raf = requestAnimationFrame(tick);
        else resolve(true);
      };
      raf = requestAnimationFrame(tick);
    });
  }, []);

  const walkTo = useCallback(
    async (ax: number, speed = 75) => {
      const from = absNow();
      const to = Math.min(window.innerWidth - W - MARGIN, Math.max(MARGIN, ax));
      setFacing((f) => facingOf(from.x, to, f));
      setPose('walk');
      const ok = await tween(walkSeconds(to - from.x, speed), (t) => setAbs(lerp(from.x, to, t), from.y));
      if (ok) setPose('sit');
      return ok;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tween],
  );
  const jumpTo = useCallback(
    async (tx: number, ty: number, secs = 0.85) => {
      const from = absNow();
      setFacing((f) => facingOf(from.x, tx, f));
      setPose('jump');
      const h = jumpHeight(tx - from.x, ty - from.y);
      return tween(secs, (t) => {
        const p = arcPoint(from, { x: tx, y: ty }, t, h);
        setAbs(p.x, p.y);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tween],
  );
  /** Yere iner */
  const descend = useCallback(async () => {
    const from = absNow();
    const gx = Math.min(window.innerWidth - W - MARGIN, Math.max(MARGIN, from.x + rnd(-160, 160)));
    const ok = await jumpTo(gx, groundTop(), 0.7);
    if (ok) setPose('sit');
    return ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo]);

  /** Bir eşyanın yanına gider (aynı seviyede yürür, değilse zıplar); eşyaya doğru bakar. true: vardı. */
  const standBeside = useCallback(
    async (el: HTMLElement, speed = 110) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const fromLeft = cx > W * 1.1 + MARGIN; // solundan yaklaş (sağa bakar); sığmıyorsa sağından
      // baş, sağa bakarken kutunun ~%80'inde, sola bakarken ~%20'sinde
      const tx = fromLeft ? cx - 0.88 * W : cx - 0.12 * W;
      const ty = r.bottom - H + 6;
      const cur = absNow();
      const ok = Math.abs(cur.y - ty) > 8 ? await jumpTo(tx, ty, 0.7) : await walkTo(tx, speed);
      if (!ok) return false;
      setFacing(fromLeft ? 1 : -1);
      setPose('sit');
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jumpTo, walkTo],
  );

  // ---------- yüzeyler: kartlar (üstüne yatar) ve panel/çubuk üst çizgileri (üstünde gezinir)
  const collectSurfaces = (): Surface[] => {
    const v = vpRef.current;
    const out: Surface[] = [];
    document.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => out.push({ el, kind: 'card', rect: el.getBoundingClientRect() }));
    document.querySelectorAll<HTMLElement>('.glass').forEach((el) => {
      if (el.closest('[data-card-id]') || root.current?.contains(el) || getComputedStyle(el).position === 'fixed') return;
      out.push({ el, kind: 'edge', rect: el.getBoundingClientRect() });
    });
    return out.filter((s) => {
      if (!usableCard(s.rect, v)) return false;
      // başka bir pencere/panel yüzeyin üstünü kapatıyorsa aday olmaz (kedinin kendisi sayılmaz)
      const hit = document.elementsFromPoint(s.rect.left + s.rect.width / 2, s.rect.top + 8).find((e) => !root.current?.contains(e));
      return Boolean(hit && s.el.contains(hit));
    });
  };

  /** Yüzeye çık: (gerekirse) altına yürü → zıpla → kartta/minderde yat / çizgide gezin → yere in */
  const attach = useCallback(
    async (s: Surface, secs: number, fromDrop = false) => {
      const el = s.el;
      visiting.current = true;
      perched.current = s;
      lastEl.current = el;
      try {
        const rectOf = () => el.getBoundingClientRect();
        const at = (along: number) => perchTarget(rectOf(), W, H, vpRef.current, 8, along);
        let along = fromDrop ? alongOf(rectOf(), absNow().x, W) : 0.5;
        if (!fromDrop) {
          const first = at(along);
          if (Math.abs(absNow().x - first.x) > 30 && !(await walkTo(first.x))) return;
        }
        const land = at(along);
        if (!(await jumpTo(land.x, land.y, fromDrop ? 0.45 : 0.95))) return;
        perched.current = s;

        /** süre boyunca yüzeyin peşinden gider; along'u a0→a1 kaydırır. false: dışarıdan iptal; 'gone': yüzey kayboldu */
        const follow = async (dur: number, a0: number, a1: number): Promise<boolean | 'gone'> => {
          let gone = false;
          const ok = await tween(dur, (t) => {
            const r = rectOf();
            if (!el.isConnected || r.top < 100 || r.top > window.innerHeight - 20) {
              gone = true;
              stopTween.current?.();
              return;
            }
            along = lerp(a0, a1, t);
            const p = at(along);
            const cur = absNow();
            setAbs(lerp(cur.x, p.x, 0.35), lerp(cur.y, p.y, 0.35));
          });
          return gone ? 'gone' : ok;
        };

        let res: boolean | 'gone' = true;
        if (s.kind === 'card') {
          // kartın/minderin üstünde yat; bacağını ve kuyruğunu sallar
          setPose('lie');
          setHappy(true);
          const title = el.dataset.cardTitle?.slice(0, 36);
          say(el.dataset.petItem === 'cushion' ? pickFrom(HOME_LINES.slice(0, 2)) : Math.random() < 0.5 && title ? `“${title}” kartını koruyorum 🛡️` : pickFrom(CARD_LINES), 5000);
          res = await follow(secs, along, along);
          setHappy(false);
        } else {
          // panel çizgisinin üstünde sağa sola gezinir
          say(pickFrom(EDGE_LINES), 4500);
          const end = performance.now() + secs * 1000;
          while (performance.now() < end) {
            const next = Math.random();
            const span = Math.max(1, rectOf().width - W);
            const dist = Math.abs(next - along) * span;
            // along 0..1 oranı piksele çevrilmeden yön hesaplanırsa kedi hiç dönmez (sola yürürken sağa bakardı)
            setFacing((f) => patrolFacing(along, next, span, f));
            setPose('walk');
            res = await follow(walkSeconds(dist), along, next);
            if (res !== true) break;
            setPose('sit');
            res = await follow(rnd(1.5, 4), along, along);
            if (res !== true) break;
          }
        }
        if (res === false) return; // dışarıdan iptal (sürükleme, uyku, besleme)
        perched.current = null;
        await descend();
      } finally {
        visiting.current = false;
      }
    },
    [walkTo, jumpTo, descend, tween, say],
  );

  // ---------- mama kabı: tıklayınca hayvan gelir ve yer (günde bir kez puan kazandırır)
  const feedAtBowl = useCallback(async () => {
    if (busy.current || visiting.current) return;
    if (asleep) return void say(pickFrom(SLEEPY_LINES), 3000);
    busy.current = true;
    visiting.current = true;
    cancel();
    try {
      const bowl = itemEl('bowl');
      if (bowl && !(await standBeside(bowl, 150))) return;
      setEating(true);
      const r = await api.feedPet();
      onPet(r);
      if (!r.fed) {
        say('Bugün zaten doydum 😸', 3500);
      } else {
        say(`${pickFrom(FED_LINES)}${r.gained ? ` +${r.gained} puan 🪙` : ''}`, 5000);
        burst(4);
        feelHappy(3500);
      }
      await sleep(1500);
    } catch {
      say('Mama kabına ulaşamadım… sonra tekrar dener misin? 🥺', 4000);
    } finally {
      setEating(false);
      busy.current = false;
      visiting.current = false;
    }
  }, [asleep, cancel, standBeside, onPet, say]);

  // ---------- yün yumağı: peşinden koşar, patisiyle vurur
  const playBall = useCallback(async () => {
    if (busy.current || visiting.current || playing.current) return;
    visiting.current = true;
    playing.current = true;
    let hits = 0;
    try {
      const rounds = Math.round(rnd(4, 8));
      for (let i = 0; i < rounds; i++) {
        const ball = itemEl('ball');
        if (!ball) break;
        const r = ball.getBoundingClientRect();
        const bx = r.left + r.width / 2;
        const fromLeft = bx > absNow().x + W / 2;
        const tx = fromLeft ? bx - 0.86 * W : bx - 0.14 * W;
        const ty = r.bottom - H + 6;
        const ok = Math.abs(absNow().y - ty) > 8 ? await jumpTo(tx, ty, 0.55) : await walkTo(tx, 190);
        if (!ok) return;
        setFacing(fromLeft ? 1 : -1);
        // atılma: küçük bir sıçrayışla vurur
        setPose('jump');
        await sleep(160);
        window.dispatchEvent(new CustomEvent('pet-bat', { detail: { dir: fromLeft ? 1 : -1, power: rnd(480, 820) } }));
        hits++;
        setPose('sit');
        if (i === 0) say(pickFrom(PLAY_LINES), 3000);
        await sleep(rnd(900, 1500)); // top yuvarlanırken bekler
      }
    } finally {
      visiting.current = false;
      playing.current = false;
      setPose('sit');
      if (hits) {
        feelHappy(1800);
        void api.petEvent('play', hits).then(onPet).catch(() => undefined);
      }
    }
  }, [jumpTo, walkTo, onPet, say]);
  // kullanıcı topu fırlatınca hayvan fark eder
  useEffect(() => {
    const on = () => {
      if (asleep || calm || inHouse || busy.current || playing.current || document.visibilityState !== 'visible') return;
      // kartın üstünde/çizgide dinleniyorsa bile oyun daha eğlencelidir: işi bırakıp topun peşine düşer
      cancel();
      window.setTimeout(() => {
        visiting.current = false;
        void playBall();
      }, 60);
    };
    window.addEventListener('pet-ball-thrown', on);
    return () => window.removeEventListener('pet-ball-thrown', on);
  }, [asleep, calm, inHouse, cancel, playBall]);

  // ---------- ev: uyku vaktinde içine girer, uyanınca çıkar
  const goHome = useCallback(
    async (house: HTMLElement) => {
      visiting.current = true;
      try {
        const r = house.getBoundingClientRect();
        const tx = r.left + r.width / 2 - W / 2;
        const ty = r.bottom - H + 6;
        const ok = Math.abs(absNow().y - ty) > 8 ? await jumpTo(tx, ty, 0.7) : await walkTo(tx, 110);
        if (!ok) return;
        setPose('sit');
        setInHouse(true);
        say(pickFrom(HOME_LINES.slice(2)), 3500);
      } finally {
        visiting.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jumpTo, walkTo, say],
  );
  // Sayfa açılırken (ya da ev sonradan yerleştirilince) uykudaysa evine gider
  const hasHouse = Boolean(pet?.placed.some((p) => p.itemId === 'house'));
  useEffect(() => {
    if (!asleep || !hasHouse || inHouse || calm) return;
    const t = window.setTimeout(() => {
      const h = itemEl('house');
      if (h && !visiting.current && !busy.current) void goHome(h);
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asleep, hasHouse]);
  // evdeyken ev taşınırsa hayvan da onunla gelir
  useEffect(() => {
    if (!inHouse) return;
    const t = window.setInterval(() => {
      const h = itemEl('house');
      if (!h) return setInHouse(false);
      const r = h.getBoundingClientRect();
      setAbs(r.left + r.width / 2 - W / 2, r.bottom - H + 6);
    }, 120);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inHouse]);

  // Pano kapanınca ya da üstüne pencere gelince hayvan aşağı iner
  useEffect(() => {
    if (!free && visiting.current && !busy.current) {
      cancel();
      setHappy(false);
      void descend();
    }
  }, [free, cancel, descend]);

  // Uykuya dalınca her şeyi bırakır: evi varsa evine girer, yoksa (yüksekteyse) önce iner. Uyanınca evden çıkar.
  const woke = useRef(false);
  useEffect(() => {
    if (asleep) {
      const high = perched.current !== null || absNow().y < groundTop() - 4;
      cancel();
      setBubble(null);
      const house = itemEl('house');
      if (house && !calm) void goHome(house);
      else if (high) void descend();
      if (woke.current) {
        woke.current = false;
        say(pickFrom(SLEEP_AGAIN), 3500);
      }
      lively.current = false;
    } else if (inHouse) {
      setInHouse(false);
      void walkTo(absNow().x + 130 * scale + 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asleep]);

  // Otonom yaşam: yerde gezinir, kartın/minderin üstüne çıkar, panel çizgisinde dolaşır, topla oynar, aç ise mama kabının yanına gider
  useEffect(() => {
    if (asleep || calm) return;
    let dead = false;
    const wait = (ms: number) =>
      new Promise<void>((res) => {
        const t = window.setTimeout(res, ms);
        poke.current = () => {
          window.clearTimeout(t);
          res();
        };
      });
    const canAct = () => !busy.current && !visiting.current && document.visibilityState === 'visible';
    void (async () => {
      await wait(lively.current ? rnd(1500, 3000) : rnd(7000, 12_000));
      while (!dead) {
        if (canAct()) {
          const { onBoard: board, free: fr } = flags.current;
          const r = Math.random();
          const cushion = itemEl('cushion');
          const ball = itemEl('ball');
          const bowl = itemEl('bowl');
          if (ball && r < 0.22) {
            await playBall();
          } else if (bowl && petRef.current && !petRef.current.fedToday && r < 0.3) {
            // aç: mama kabının yanına gidip seslenir (yemek için kullanıcının tıklaması gerekir)
            if (await standBeside(bowl)) say(pickFrom(BOWL_LINES), 5000);
          } else if (cushion && fr && r < 0.45) {
            const rect = cushion.getBoundingClientRect();
            await attach({ el: cushion, kind: 'card', rect }, lively.current ? rnd(8, 14) : rnd(20, 40));
          } else {
            const ss = fr ? collectSurfaces().filter((s) => s.el !== lastEl.current) : [];
            const cards = board ? ss.filter((s) => s.kind === 'card') : [];
            const edges = ss.filter((s) => s.kind === 'edge');
            const q = Math.random();
            const pick = cards.length && q < (lively.current ? 0.85 : 0.65) ? cards : edges.length && q < (lively.current ? 0.95 : 0.8) ? edges : [];
            const target = pick.length ? pick[Math.floor(Math.random() * pick.length)]! : null;
            if (target) await attach(target, lively.current ? rnd(6, 10) : rnd(12, 22));
            else await walkTo(strollTarget(absNow().x, MARGIN, window.innerWidth - W - MARGIN));
          }
        }
        await wait(lively.current ? rnd(2500, 6000) : rnd(12_000, 26_000));
      }
    })();
    return () => {
      dead = true;
      poke.current?.();
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asleep, calm]);

  const ctx: PetCtx | null = useMemo(() => {
    if (!pet) return null;
    const next = (today?.meetings ?? []).map((m) => ({ ...m, ms: Date.parse(m.at) })).filter((m) => m.ms > Date.now()).sort((a, b) => a.ms - b.ms)[0];
    return {
      name: pet.name,
      mood: pet.mood,
      fedToday: pet.fedToday,
      streak: pet.streak,
      hour: new Date().getHours(),
      nextMeetingMins: next ? Math.round((next.ms - Date.now()) / 60_000) : null,
      nextMeetingTitle: next?.title ?? null,
      critical,
    };
  }, [pet, today, critical]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Ara sıra kendiliğinden konuşur (uyurken ya da sekme görünmezken değil)
  useEffect(() => {
    if (asleep) return;
    let t: number;
    const loop = (first = false) => {
      t = window.setTimeout(() => {
        const c = ctxRef.current;
        if (c && document.visibilityState === 'visible' && !busy.current && !visiting.current) say(pickLine(c, Math.random, lastLine.current));
        loop();
      }, first ? 7000 : 45_000 + Math.random() * 45_000);
    };
    loop(true);
    return () => window.clearTimeout(t);
  }, [asleep, say]);

  // Ara sıra küçük bir zıplama (otururken)
  useEffect(() => {
    if (asleep || calm) return;
    const t = window.setInterval(() => {
      if (!busy.current && !visiting.current && document.visibilityState === 'visible') void hop.start({ y: [0, -18, 0, -8, 0], transition: { duration: 0.7, ease: 'easeOut' } });
    }, 25_000 + Math.random() * 20_000);
    return () => window.clearInterval(t);
  }, [asleep, calm, hop]);

  /** Hareketli mod: bir süre sık sık gezinir/zıplar */
  const energize = (ms: number) => {
    lively.current = true;
    window.clearTimeout(livelyTimer.current);
    livelyTimer.current = window.setTimeout(() => {
      lively.current = false;
      setWake(false); // uyku saatindeyse yeniden uykuya dalar
    }, ms);
    poke.current?.();
  };
  useEffect(() => () => window.clearTimeout(livelyTimer.current), []);

  // Sevme sayacı sunucuya (rozetler için) toplu gider
  const flushPats = useCallback(() => {
    const n = patsPending.current;
    patsPending.current = 0;
    if (n > 0) void api.petEvent('pat', n).then(onPet).catch(() => undefined);
  }, [onPet]);
  useEffect(
    () => () => {
      window.clearTimeout(patsTimer.current);
      flushPats();
    },
    [flushPats],
  );

  // Evin duvarına dokunmak içerideki hayvanı sevmek sayılır (uyuyan hayvan kapıdan görünmeyebilir)
  const patRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const on = () => {
      if (inHouse) patRef.current();
    };
    window.addEventListener('pet-knock', on);
    return () => window.removeEventListener('pet-knock', on);
  }, [inHouse]);

  const pat = () => {
    const now = Date.now();
    pats.current = [...pats.current.filter((t) => now - t < 15_000), now];
    const many = pats.current.length >= 3;
    burst(2);
    feelHappy(1800);
    patsPending.current++;
    window.clearTimeout(patsTimer.current);
    patsTimer.current = window.setTimeout(flushPats, 8000);
    if (asleep) {
      if (many) {
        setWake(true); // uyku modu bozulmaz: süre bitince tekrar uyur
        woke.current = true;
        energize(WAKE_MS);
        say(pickFrom(WAKE_LINES), 5000);
        pats.current = [];
      } else say(pickFrom(SLEEPY_LINES), 3500);
    } else if (many && !lively.current) {
      energize(EXCITE_MS);
      say(pickFrom(EXCITED_LINES), 4500);
      pats.current = [];
    } else {
      say(pickFrom(PAT_LINES), 3500);
    }
    if (pose === 'sit' && !asleep) void hop.start({ y: [0, -10, 0], transition: { duration: 0.4 } });
  };

  patRef.current = pat;

  // Eşya taşındı: sunucuya kaydet
  const moveItem = useCallback(
    (id: PetItemId, nx: number, nb: number) => {
      void api.placePetItem(id, nx, nb).then(onPet).catch(() => undefined);
    },
    [onPet],
  );

  const eyes: CatEyes = asleep && !happy ? 'closed' : happy || eating ? 'happy' : 'open';
  if (!pet) return null;
  // uykuda yerde ise kıvrılıp uyur; kartın üstündeyse zaten yatıyor
  const shownPose: CatPose = asleep && pose === 'sit' ? 'sleep' : pose;
  const lying = shownPose === 'lie' || shownPose === 'sleep';

  return (
    <>
      <PetWorld placed={pet.placed} fedToday={pet.fedToday} scale={scale} onMoved={moveItem} onBowl={() => void feedAtBowl()} />
      <div className={`pointer-events-none fixed inset-0 ${inHouse ? 'z-[43]' : 'z-[46]'}`} aria-live="polite">
        <motion.div
          ref={root}
          drag
          dragMomentum={false}
          dragElastic={0.08}
          dragConstraints={limits}
          style={{ x, y, left: MARGIN, bottom: BOTTOM, width: W, height: H }}
          onDragStart={() => {
            cancel();
            setInHouse(false);
            setHappy(false);
            setLifted(true);
            busy.current = true;
          }}
          onDragEnd={() => {
            setLifted(false);
            busy.current = false;
            // bir kartın üstüne ya da bir çizginin yakınına bırakıldıysa oraya yapışır
            const a = absNow();
            const target = free ? dropTarget(collectSurfaces(), { left: a.x, top: a.y, W, H }) : null;
            if (target && !asleep) {
              say(pickFrom(DROP_LINES), 2500);
              void attach(target, rnd(40, 70), true);
              return;
            }
            try {
              localStorage.setItem(POS_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
            } catch {
              /* yoksay */
            }
            if (Math.random() < 0.5) say(pickFrom(DROP_LINES), 3000);
          }}
          whileDrag={{ scale: 1.08 }}
          className="group pointer-events-auto absolute cursor-grab select-none active:cursor-grabbing"
          title={`${pet.name} — sev, sürükle${pet.fedToday ? '' : ' ya da mama kabına tıklayıp besle'}`}
        >
          {/* konuşma balonu */}
          <AnimatePresence>
            {bubble && !lifted && (
              <motion.div
                key={bubble}
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95, transition: { duration: 0.15 } }}
                className="glass-solid absolute bottom-full left-2 mb-1 w-max max-w-[220px] rounded-2xl rounded-bl-sm px-3 py-2 text-[12.5px] leading-snug text-ink"
              >
                {bubble}
              </motion.div>
            )}
          </AnimatePresence>

          {/* kalpler */}
          <AnimatePresence>
            {hearts.map((h) => (
              <motion.span
                key={h.id}
                initial={{ opacity: 0, y: 0, x: W / 2 + h.dx, scale: 0.6 }}
                animate={{ opacity: [0, 1, 0], y: -60, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className="pointer-events-none absolute top-2 text-lg"
              >
                💛
              </motion.span>
            ))}
          </AnimatePresence>

          <motion.div animate={hop} onTap={pat} role="button" aria-label={`${pet.name}'ı sev`} className="relative flex h-full w-full items-end justify-center">
            <div className="flex items-end justify-center" style={{ transform: `scaleX(${lying ? 1 : facing})`, transformOrigin: 'bottom center', transition: 'transform 0.22s ease-in-out' }}>
              <Cat pose={shownPose} eyes={eyes} eating={eating} lifted={lifted} calm={calm} size={W} species={species} worn={worn} />
            </div>
          </motion.div>

          {/* ad ve seri: üzerine gelince */}
          <div className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-black/50 px-2 py-0.5 text-[10.5px] text-ink-dim opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            {pet.name}
            {pet.streak > 0 && ` · 🔥 ${pet.streak} gün`}
          </div>
        </motion.div>
      </div>
    </>
  );
}
