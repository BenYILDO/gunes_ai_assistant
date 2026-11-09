import { useAnimationFrame } from 'motion/react';
import { useId, useRef } from 'react';
import { CatHead, SKINS, type CatEyes, type Skin, type Worn } from './CatHead';

export type CatPose = 'sit' | 'walk' | 'jump' | 'lie' | 'sleep';

const rad = (p: number) => 2 * Math.PI * p;
/** Tilkinin gür kuyruğu: tabanda ince, ucuna doğru kabarır */
const FOX_TAIL = 'M46 78 C22 86 -2 70 2 44 C4 26 18 16 28 26 C36 34 34 48 42 60 C44 66 46 72 46 78 Z';
const set = (el: SVGElement | null, v: string) => el?.setAttribute('transform', v);

/** Bacak kemiği (kalça noktası 0,0): üst bacak + dirsek/diz + alt bacak + pati. Açılar ref'ler üzerinden her karede ayarlanır. */
function Leg({ legRef, lowRef, x, y, skin, far = false }: { legRef: React.RefObject<SVGGElement | null>; lowRef: React.RefObject<SVGGElement | null>; x: number; y: number; skin: Skin; far?: boolean }) {
  const fill = far ? skin.furFar : skin.fur;
  const fx = skin.kind === 'fox';
  const w = 10;
  const lower = fx ? skin.sock : fill;
  const paw = far ? skin.pawFar : skin.paw;
  return (
    <g ref={legRef} transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y="-3" width={w} height="19" rx={w / 2} fill={fill} stroke={skin.outline} strokeWidth="1" />
      <g ref={lowRef} transform="translate(0 14)">
        <rect x={-w * 0.42} y="0" width={w * 0.84} height={15} rx={w * 0.4} fill={lower} stroke={skin.outline} strokeWidth="1" />
        <ellipse cx="1.5" cy="15.5" rx="6.8" ry="4.4" fill={paw} stroke={skin.outline} strokeWidth="1" />
      </g>
    </g>
  );
}

/**
 * Yandan görünen, dört ayaklı Tarçın. Yürüme döngüsü gerçek kedi yürüyüşünü izler (dört vuruşlu: arka sol → ön sol → arka sağ → ön sağ);
 * her karede açılar hesaplanıp ref'lere yazılır (React yeniden çizmez). Pozlar: sit (ayakta bekler), walk, jump, (kaldırılınca) lifted.
 */
export function CatSide({ pose = 'sit', eyes = 'open', eating = false, lifted = false, calm = false, size = 128, skin = SKINS.cat, worn = {} }: { pose?: CatPose; eyes?: CatEyes; eating?: boolean; lifted?: boolean; calm?: boolean; size?: number; skin?: Skin; worn?: Worn }) {
  const r = {
    rig: useRef<SVGGElement>(null),
    tail: useRef<SVGGElement>(null),
    body: useRef<SVGGElement>(null),
    head: useRef<SVGGElement>(null),
    eyes: useRef<SVGGElement>(null),
    earL: useRef<SVGGElement>(null),
    earR: useRef<SVGGElement>(null),
    bn: useRef<SVGGElement>(null),
    bnL: useRef<SVGGElement>(null),
    fn: useRef<SVGGElement>(null),
    fnL: useRef<SVGGElement>(null),
    bf: useRef<SVGGElement>(null),
    bfL: useRef<SVGGElement>(null),
    ff: useRef<SVGGElement>(null),
    ffL: useRef<SVGGElement>(null),
  };
  const st = useRef({ pose, eating, lifted, calm });
  st.current = { pose, eating, lifted, calm };

  useAnimationFrame((ms) => {
    const t = ms / 1000;
    const { pose: ps, eating: eat, lifted: lf, calm: cm } = st.current;
    const hips = { bn: [46, 90], fn: [110, 90], bf: [56, 90], ff: [100, 90] } as const;
    // sakin mod (hareket azaltma): sabit duruş
    const walking = ps === 'walk' && !cm;
    const p = (t / 0.7) % 1; // yürüme döngüsü: 0,7 sn
    const ang = { bn: 0, fn: 0, bf: 0, ff: 0 };
    const low = { bn: 0, fn: 0, bf: 0, ff: 0 };
    let bob = 0;
    let tilt = 0;
    let tail = cm ? 0 : Math.sin(t * 1.6) * 9;
    let headRot = cm ? 0 : Math.sin(t * 0.9) * 2;
    let headDy = 0;

    if (walking) {
      const off = { bn: 0, fn: 0.25, bf: 0.5, ff: 0.75 } as const; // dört vuruşlu yürüyüş
      (Object.keys(off) as (keyof typeof off)[]).forEach((k) => {
        const s = Math.sin(rad(p + off[k]));
        const c = Math.cos(rad(p + off[k]));
        const hind = k === 'bn' || k === 'bf';
        ang[k] = -(hind ? 22 : 27) * s;
        low[k] = (hind ? 38 : 50) * Math.max(0, c) + 4; // ayak öne giderken diz bükülür
      });
      bob = -1.8 * Math.abs(Math.sin(rad(p * 2 + 0.1))); // her adımda hafif zıplama
      tilt = Math.sin(rad(p * 2)) * 1.2;
      tail = Math.sin(rad(p) + 1) * 12;
      headRot = Math.sin(rad(p * 2)) * 3;
      headDy = Math.cos(rad(p * 2)) * 1.2;
    } else if (ps === 'jump') {
      ang.fn = -62;
      ang.ff = -48;
      low.fn = 25;
      low.ff = 20;
      ang.bn = 42;
      ang.bf = 30;
      low.bn = 10;
      low.bf = 8;
      tilt = -12;
      tail = 18;
      headRot = -6;
    } else if (lf) {
      // tutulup kaldırılınca bacaklar sallanır
      (Object.keys(ang) as (keyof typeof ang)[]).forEach((k, i) => {
        ang[k] = Math.sin(t * 7 + i) * 12;
        low[k] = 10 + Math.sin(t * 7 + i + 1) * 8;
      });
      tilt = Math.sin(t * 5) * 7;
      tail = Math.sin(t * 6) * 26;
      headRot = Math.sin(t * 5 + 1) * 5;
    }
    if (eat) {
      headDy = 9 + Math.abs(Math.sin(t * 7)) * 3;
      headRot = 10;
    }
    const breathe = cm ? 1 : 1 + Math.sin(t * 2.4) * 0.018;

    set(r.rig.current, `translate(0 ${bob}) rotate(${tilt} 80 100)`);
    set(r.body.current, `translate(78 100) scale(1 ${breathe}) translate(-78 -100)`);
    set(r.tail.current, `rotate(${tail} 42 78)`);
    for (const k of ['bn', 'fn', 'bf', 'ff'] as const) {
      set(r[k].current, `translate(${hips[k][0]} ${hips[k][1]}) rotate(${ang[k]})`);
      set(r[`${k}L` as 'bnL'].current, `translate(0 14) rotate(${low[k]})`);
    }
    set(r.head.current, `translate(120 ${60 + headDy}) rotate(${headRot}) scale(0.78)`);
    // göz kırpma (her ~4 sn'de bir, 0,14 sn) ve ara sıra kulak oynatma
    const blink = !cm && t % 4.2 > 4.06 ? 0.1 : 1;
    // yürürken/zıplarken gözler gidilen yöne (öne) bakar
    const gaze = ps === 'walk' || ps === 'jump' ? 3 : 0;
    set(r.eyes.current, `translate(${gaze} 0) scale(1 ${blink})`);
    const flick = !cm && t % 7 > 6.7 ? -9 : 0;
    set(r.earL.current, `rotate(${flick} -18 -22)`);
  });

  const fox = skin.kind === 'fox';
  const uid = useId().replace(/:/g, '');
  const w = size * 1.2;
  return (
    <svg width={w} height={(w * 110) / 160} viewBox="0 0 160 110" role="img" aria-label="Evcil kedi" style={{ overflow: 'visible', flexShrink: 0 }}>
      <ellipse cx="80" cy="105" rx={lifted ? 26 : 46} ry="4" fill="#000" opacity={lifted ? 0.1 : 0.2} />
      <g ref={r.rig}>
        {/* kuyruk */}
        <g ref={r.tail}>
          {fox ? (
            <>
              <defs>
                <clipPath id={`${uid}-tail`}>
                  <path d={FOX_TAIL} />
                </clipPath>
              </defs>
              <path d={FOX_TAIL} fill={skin.tail} stroke={skin.outline} strokeWidth="1.6" strokeLinejoin="round" />
              <g clipPath={`url(#${uid}-tail)`}>
                <ellipse cx="9" cy="24" rx="20" ry="17" fill={skin.tailTip} />
                <path d="M30 60 Q40 56 48 70 L40 80 Z" fill={skin.belly} opacity="0.9" />
              </g>
              <path d={FOX_TAIL} fill="none" stroke={skin.outline} strokeWidth="1.6" strokeLinejoin="round" />
            </>
          ) : (
            <>
              <path d="M42 78 C16 82 8 58 20 40" fill="none" stroke={skin.outline} strokeWidth="11" strokeLinecap="round" />
              <path d="M42 78 C16 82 8 58 20 40" fill="none" stroke={skin.tail} strokeWidth="9" strokeLinecap="round" />
              <path d="M22 44 C19 48 18 49 17 52" fill="none" stroke={skin.tailTip} strokeWidth="9" strokeLinecap="round" />
            </>
          )}
        </g>
        {/* uzak bacaklar */}
        <Leg legRef={r.bf} lowRef={r.bfL} x={56} y={90} skin={skin} far />
        <Leg legRef={r.ff} lowRef={r.ffL} x={100} y={90} skin={skin} far />
        {/* gövde */}
        <g ref={r.body}>
          <ellipse cx="78" cy="78" rx="42" ry="22" fill={skin.fur} stroke={skin.outline} strokeWidth="1.4" />
          <ellipse cx="82" cy="90" rx="28" ry="9" fill={skin.belly} />
          {!fox && <path d="M52 60 Q56 68 54 76 M66 56 Q70 66 68 75 M80 55 Q84 65 82 74 M94 57 Q97 66 95 74" fill="none" stroke={skin.furDark} strokeWidth="3.2" strokeLinecap="round" />}
        </g>
        {/* yakın bacaklar */}
        <Leg legRef={r.bn} lowRef={r.bnL} x={46} y={90} skin={skin} />
        <Leg legRef={r.fn} lowRef={r.fnL} x={110} y={90} skin={skin} />
        {/* baş */}
        <g ref={r.head}>
          <CatHead eyes={eyes} mouthOpen={eating} skin={skin} worn={worn} eyesRef={r.eyes} earLRef={r.earL} earRRef={r.earR} />
        </g>
      </g>
    </svg>
  );
}
