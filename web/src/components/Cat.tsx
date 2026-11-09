import { CatLying } from './CatLying';
import { CatSide, type CatPose } from './CatSide';
import { SKINS, type CatEyes, type Worn } from './CatHead';

export type { CatEyes, Worn } from './CatHead';
export type { CatPose } from './CatSide';

/**
 * Hayvan (kedi ya da tilki). sit/walk/jump: yandan görünen dört ayaklı (CatSide); lie/sleep: karnı üstüne yatan (CatLying).
 * Tüm hareket her karede ref'ler üzerinden hesaplanır (oyun karakteri gibi bir iskelet/yürüme döngüsü).
 */
export function Cat({
  pose = 'sit',
  eyes = 'open',
  eating = false,
  lifted = false,
  calm = false,
  size = 120,
  species = 'cat',
  worn = {},
}: {
  pose?: CatPose;
  eyes?: CatEyes;
  eating?: boolean;
  lifted?: boolean;
  calm?: boolean;
  size?: number;
  species?: 'cat' | 'fox';
  worn?: Worn;
}) {
  const skin = SKINS[species];
  if (pose === 'lie' || pose === 'sleep') return <CatLying eyes={eyes} calm={calm} size={size} sleeping={pose === 'sleep'} skin={skin} worn={worn} />;
  return <CatSide pose={pose} eyes={eyes} eating={eating} lifted={lifted} calm={calm} size={size} skin={skin} worn={worn} />;
}
