import type { RefObject } from 'react';

export type CatEyes = 'open' | 'happy' | 'closed';

/** Hayvanın renkleri ve türe özgü ayrıntılar (kedi / tilki). Tüm çizimler bu "skin"i kullanır. */
export interface Skin {
  kind: 'cat' | 'fox';
  fur: string;
  furDark: string;
  furFar: string;
  belly: string;
  outline: string;
  /** kulağın içi */
  earInner: string;
  /** kulağın dışı (tilkide siyah) */
  ear: string;
  /** alt bacak (çorap) rengi; kedide gövde rengi */
  sock: string;
  paw: string;
  pawFar: string;
  tail: string;
  tailTip: string;
  nose: string;
}
export const SKINS: Record<'cat' | 'fox', Skin> = {
  cat: { kind: 'cat', fur: '#f2a154', furDark: '#d9822b', furFar: '#dd8c42', belly: '#fde9cf', outline: '#b8651e', earInner: '#f7b5b5', ear: '#f2a154', sock: '#f2a154', paw: '#fde9cf', pawFar: '#f1d5b2', tail: '#f2a154', tailTip: '#d9822b', nose: '#e98f8f' },
  fox: { kind: 'fox', fur: '#e2622a', furDark: '#b84a1b', furFar: '#c8571f', belly: '#fff4e6', outline: '#7d3210', earInner: '#fff0de', ear: '#35241f', sock: '#2c1f1b', paw: '#2c1f1b', pawFar: '#241915', tail: '#e2622a', tailTip: '#ffffff', nose: '#1a1210' },
};
export const INK = '#2b1b0e';

export interface Worn {
  hat?: boolean;
  bow?: boolean;
}

/**
 * Hayvanın yüzü (merkez 0,0). Yandan görünen gövdeye "önden bakan baş" olarak takılır (çizgi film stili).
 * Kedi: yuvarlak yüz, kısa kulak, alında çizgiler. Tilki: AŞAĞIYA DOĞRU SİVRİLEN üçgen yüz, uzun siyah arkalı kulaklar, beyaz yanak tüyü ve
 * burun, çekik gözler, siyah burun. Göz kırpma ve kulak oynatma için dışarıdan ref alır.
 */
export function CatHead({
  eyes = 'open',
  mouthOpen = false,
  skin = SKINS.cat,
  worn = {},
  eyesRef,
  earLRef,
  earRRef,
}: {
  eyes?: CatEyes;
  mouthOpen?: boolean;
  skin?: Skin;
  worn?: Worn;
  eyesRef?: RefObject<SVGGElement | null>;
  earLRef?: RefObject<SVGGElement | null>;
  earRRef?: RefObject<SVGGElement | null>;
}) {
  const fox = skin.kind === 'fox';
  return (
    <g>
      {/* kulaklar (kendi köşelerinde oynar) */}
      <g ref={earLRef}>
        <path d={fox ? 'M-27 -12 L-35 -52 L-4 -27 Z' : 'M-27 -14 L-30 -46 L-3 -27 Z'} fill={skin.fur} stroke={skin.outline} strokeWidth="1.2" strokeLinejoin="round" />
        <path d={fox ? 'M-25 -18 L-31 -42 L-12 -27 Z' : 'M-24 -20 L-25 -37 L-11 -26 Z'} fill={skin.earInner} />
        {fox && <path d="M-35 -52 L-32.2 -40 L-25 -44.6 Z" fill={skin.ear} />}
      </g>
      <g ref={earRRef}>
        <path d={fox ? 'M27 -12 L35 -52 L4 -27 Z' : 'M27 -14 L30 -46 L3 -27 Z'} fill={skin.fur} stroke={skin.outline} strokeWidth="1.2" strokeLinejoin="round" />
        <path d={fox ? 'M25 -18 L31 -42 L12 -27 Z' : 'M24 -20 L25 -37 L11 -26 Z'} fill={skin.earInner} />
        {fox && <path d="M35 -52 L32.2 -40 L25 -44.6 Z" fill={skin.ear} />}
      </g>

      {fox ? (
        <>
          {/* yüz: yuvarlak ve tombul (kediyle aynı oran), altı beyaz */}
          <ellipse rx="33" ry="30" fill={skin.fur} stroke={skin.outline} strokeWidth="1.4" />
          <path d="M-31 5 Q-23 -2 -11 8 Q0 13 11 8 Q23 -2 31 5 Q34 23 15 30 Q0 34 -15 30 Q-34 23 -31 5 Z" fill={skin.belly} />
          <path d="M-32 9 L-41 13 L-32 17 Z M32 9 L41 13 L32 17 Z" fill={skin.belly} stroke={skin.outline} strokeWidth="1" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle r="31" fill={skin.fur} stroke={skin.outline} strokeWidth="1.4" />
          <path d="M0 -30 L0 -21 M-8 -28 L-7 -21 M8 -28 L7 -21" stroke={skin.furDark} strokeWidth="3" strokeLinecap="round" />
          <circle cx="-21" cy="10" r="6" fill="#f7a8a0" opacity="0.55" />
          <circle cx="21" cy="10" r="6" fill="#f7a8a0" opacity="0.55" />
        </>
      )}

      {/* gözler */}
      {eyes === 'open' && (
        <g ref={eyesRef}>
          <ellipse cx="-13" cy={fox ? -2 : 0} rx="4.8" ry="5.8" fill={INK} />
          <ellipse cx="13" cy={fox ? -2 : 0} rx="4.8" ry="5.8" fill={INK} />
          <circle cx="-11.4" cy={fox ? -4.2 : -2.2} r="1.7" fill="#fff" />
          <circle cx="14.6" cy={fox ? -4.2 : -2.2} r="1.7" fill="#fff" />
        </g>
      )}
      {eyes === 'happy' && <path d="M-19 2 Q-13 -6 -7 2 M7 2 Q13 -6 19 2" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      {eyes === 'closed' && <path d="M-19 0 Q-13 6 -7 0 M7 0 Q13 6 19 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />}

      {/* burun, ağız, bıyıklar */}
      {fox ? (
        <>
          <path d="M-4.2 11 L4.2 11 L0 16 Z" fill={skin.nose} stroke={skin.nose} strokeWidth="1.6" strokeLinejoin="round" />
          {mouthOpen || eyes === 'happy' ? <path d="M-7 19 Q0 29 7 19 Z" fill="#a84b4b" /> : <path d="M0 16 Q-4 21 -9 18 M0 16 Q4 21 9 18" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />}
          <path d="M-33 13 L-47 11 M-33 17 L-47 20 M33 13 L47 11 M33 17 L47 20" stroke={skin.outline} strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
        </>
      ) : (
        <>
          <path d="M-3.5 8 L3.5 8 L0 12.5 Z" fill={skin.nose} />
          {mouthOpen || eyes === 'happy' ? (
            <path d="M-8 14 Q0 25 8 14 Z" fill="#a84b4b" />
          ) : (
            <path d="M0 12.5 Q-5 18 -10 15 M0 12.5 Q5 18 10 15" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          )}
          <path d="M-26 8 L-42 5 M-26 12 L-42 14 M26 8 L42 5 M26 12 L42 14" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
        </>
      )}

      {/* aksesuarlar */}
      {worn.bow && (
        <g transform={`translate(0 ${fox ? 33 : 31})`}>
          <path d="M0 0 L-17 -9 L-17 9 Z" fill="#e0516b" stroke="#a02a44" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M0 0 L17 -9 L17 9 Z" fill="#e0516b" stroke="#a02a44" strokeWidth="1.2" strokeLinejoin="round" />
          <circle r="4.6" fill="#f06a85" stroke="#a02a44" strokeWidth="1.2" />
        </g>
      )}
      {worn.hat && (
        <g transform={`translate(${fox ? 4 : 6} ${fox ? -32 : -30}) rotate(10)`}>
          <path d="M-13 0 L0 -32 L13 0 Z" fill="#7a6cf0" stroke="#4a3fb8" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M-9 -8 L9 -8 M-5 -18 L5 -18" stroke="#ffd45a" strokeWidth="3" strokeLinecap="round" />
          <circle cy="-33" r="4.5" fill="#ffd45a" stroke="#c9a01c" strokeWidth="1" />
        </g>
      )}
    </g>
  );
}
