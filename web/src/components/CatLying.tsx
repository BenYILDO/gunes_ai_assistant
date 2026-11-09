import { motion, useAnimationFrame } from 'motion/react';
import { useId, useRef } from 'react';
import { CatHead, SKINS, type CatEyes, type Skin, type Worn } from './CatHead';

const set = (el: SVGElement | null, v: string) => el?.setAttribute('transform', v);
/** Yatan tilkinin kuyruğu: arkadan başlayıp karnın önünden dolanır */
const FOX_TAIL_LYING = 'M30 70 C22 90 70 94 118 90 C140 88 158 82 150 74 C144 68 130 74 112 78 C84 84 52 80 40 68 Z';

/**
 * Yatan Tarçın ("sfenks" duruşu): ön patiler öne uzanmış, baş patilerin arkasında, arka bacak gövdeye KIVRILMIŞ (yalnızca uyluk kıvrımı ve
 * altından görünen arka pati — gerçek bir yatan kedi gibi). Kuyruk yavaşça sallanır, nefes alır, göz kırpar, kulağını oynatır;
 * ara sıra arka patisini hafifçe titretir. Uyurken gözler kapalı ve "z"ler yükselir.
 */
export function CatLying({ eyes = 'happy', calm = false, size = 128, sleeping = false, skin = SKINS.cat, worn = {} }: { eyes?: CatEyes; calm?: boolean; size?: number; sleeping?: boolean; skin?: Skin; worn?: Worn }) {
  const fox = skin.kind === 'fox';
  const uid = useId().replace(/:/g, '');
  const r = {
    tail: useRef<SVGGElement>(null),
    body: useRef<SVGGElement>(null),
    paw: useRef<SVGGElement>(null),
    head: useRef<SVGGElement>(null),
    eyes: useRef<SVGGElement>(null),
    earL: useRef<SVGGElement>(null),
    earR: useRef<SVGGElement>(null),
  };
  const cm = useRef(calm);
  cm.current = calm;

  useAnimationFrame((ms) => {
    const t = ms / 1000;
    const still = cm.current;
    // nefes: gövde alttan yukarı hafifçe kabarır
    set(r.body.current, `translate(70 88) scale(1 ${still ? 1 : 1 + Math.sin(t * 2.1) * 0.03}) translate(-70 -88)`);
    // kuyruk: yerde arkaya uzanmış, iki yana yavaşça kayar
    set(r.tail.current, `rotate(${still ? 0 : Math.sin(t * 1.7) * (fox ? 2.5 : 14)} 30 78)`);
    // arka pati: ara sıra (yaklaşık 5 sn'de bir) hafifçe titrer
    const twitch = !still && !sleeping && t % 5.3 > 5.0 ? Math.sin((t % 5.3) * 38) * 2.2 : 0;
    set(r.paw.current, `translate(0 ${twitch})`);
    set(r.head.current, `translate(122 56) rotate(${-4 + (still ? 0 : Math.sin(t * 1.3) * 2)}) scale(0.9)`);
    set(r.eyes.current, `scale(1 ${!still && t % 4.6 > 4.45 ? 0.1 : 1})`);
    set(r.earL.current, `rotate(${!still && t % 6.3 > 6.05 ? -10 : 0} -18 -22)`);
  });

  const w = size * 1.3;
  return (
    <svg width={w} height={(w * 92) / 170} viewBox="0 0 170 92" role="img" aria-label="Yatan evcil kedi" style={{ overflow: 'visible', flexShrink: 0 }}>
      <ellipse cx="86" cy="89" rx="68" ry="3.6" fill="#000" opacity="0.18" />

      {/* kuyruk: gövdenin arkasında yerde, ucu kıvrık */}
      <g ref={r.tail}>
        {!fox && (
          <>
            <path d="M30 78 C8 84 2 62 14 50" fill="none" stroke={skin.outline} strokeWidth="11" strokeLinecap="round" />
            <path d="M30 78 C8 84 2 62 14 50" fill="none" stroke={skin.tail} strokeWidth="9" strokeLinecap="round" />
            <path d="M15 54 C12 58 11 60 10 62" fill="none" stroke={skin.tailTip} strokeWidth="9" strokeLinecap="round" />
          </>
        )}
      </g>

      {/* gövde: arkası (kalça) yüksek, öne doğru alçalır */}
      <g ref={r.body}>
        <path d="M26 72 C22 52 40 36 66 38 C92 40 106 52 114 64 L116 82 C100 88 58 90 38 88 C28 87 26 80 26 72 Z" fill={skin.fur} stroke={skin.outline} strokeWidth="1.6" strokeLinejoin="round" />
        {/* sırt çizgileri (yalnızca kedide) */}
        {!fox && <path d="M58 41 Q62 50 60 58 M74 40 Q79 49 77 58 M90 44 Q94 52 92 60" fill="none" stroke={skin.furDark} strokeWidth="3.4" strokeLinecap="round" />}
        {/* kıvrık arka bacak: uyluk yayı */}
        <path d="M38 78 C32 60 48 48 62 56 C70 61 70 74 62 80" fill={skin.furFar} stroke={skin.outline} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M40 80 C52 84 62 82 68 78" fill="none" stroke={skin.outline} strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      </g>

      {/* altından görünen arka pati */}
      <g ref={r.paw}>
        <ellipse cx="72" cy="85" rx="11" ry="5" fill={skin.paw} stroke={skin.outline} strokeWidth="1.3" />
        <path d="M68 83 L68 87 M73 82.5 L73 87 M78 83 L78 87" stroke={fox ? "#fff" : skin.outline} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      </g>

      {/* tilki: gür kuyruğu gövdesinin etrafından öne dolanır, ucu beyaz */}
      {fox && (
        <g ref={r.tail}>
          <defs>
            <clipPath id={`${uid}-ft`}>
              <path d={FOX_TAIL_LYING} />
            </clipPath>
          </defs>
          <path d={FOX_TAIL_LYING} fill={skin.tail} stroke={skin.outline} strokeWidth="1.6" strokeLinejoin="round" />
          <g clipPath={`url(#${uid}-ft)`}>
            <ellipse cx="146" cy="84" rx="20" ry="14" fill={skin.tailTip} />
          </g>
          <path d={FOX_TAIL_LYING} fill="none" stroke={skin.outline} strokeWidth="1.6" strokeLinejoin="round" />
        </g>
      )}
      {/* ön kollar ve patiler: öne uzanmış */}
      <ellipse cx="124" cy="80" rx="24" ry="6.5" fill={fox ? skin.sock : skin.fur} stroke={skin.outline} strokeWidth="1.4" />
      <ellipse cx="140" cy="81" rx="13" ry="6" fill={skin.paw} stroke={skin.outline} strokeWidth="1.4" />
      <path d="M135 78.5 L135 84 M141 78 L141 84.5 M147 78.5 L147 84" stroke={fox ? "#fff" : skin.outline} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <ellipse cx="158" cy="85" rx="11" ry="5" fill={skin.paw} stroke={skin.outline} strokeWidth="1.4" />

      {/* baş */}
      <g ref={r.head}>
        <CatHead eyes={sleeping ? 'closed' : eyes === 'open' ? 'happy' : eyes} skin={skin} worn={worn} eyesRef={r.eyes} earLRef={r.earL} earRRef={r.earR} />
      </g>

      {/* uyurken z'ler */}
      {sleeping && !calm && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0], y: [0, -12, -22], x: [0, 4, 8] }} transition={{ duration: 2.6, repeat: Infinity }}>
          <text x="146" y="22" fontSize="16" fontWeight="700" fill="#cfd6ff">z</text>
          <text x="156" y="10" fontSize="12" fontWeight="700" fill="#cfd6ff">z</text>
        </motion.g>
      )}
    </svg>
  );
}
