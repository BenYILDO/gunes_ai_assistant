/**
 * Konuma göre hava durumu (Open-Meteo, ücretsiz ve anahtarsız).
 * Konum: tarayıcının paylaştığı konum → .env (GUNES_LAT/GUNES_LON) → İstanbul.
 * Gün doğumu/batımı da buradan gelir; arayüz temayı gerçek güneşe göre ayarlar.
 */
import { getStore } from './store/index.js';

export type WeatherKind = 'clear' | 'partly' | 'clouds' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface Weather {
  place: string | null;
  /** Konumun kaynağı: browser (otomatik) | manual (elle seçilen) | env | default */
  locationSource: string;
  lat: number;
  lon: number;
  temp: number;
  feelsLike: number | null;
  code: number;
  kind: WeatherKind;
  label: string;
  isDay: boolean;
  cloudCover: number | null;
  wind: number | null;
  sunrise: string | null;
  sunset: string | null;
  todayMax: number | null;
  todayMin: number | null;
  rainChance: number | null;
  /** Yarının tahmini (akşam uğurlaması için) */
  tomorrow: { kind: WeatherKind; label: string; max: number | null; min: number | null; rainChance: number | null } | null;
  updatedAt: string;
}

/** WMO hava kodları → tema türü + Türkçe etiket */
export function describe(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: 'clear', label: 'Açık' };
  if (code === 1) return { kind: 'partly', label: 'Az bulutlu' };
  if (code === 2) return { kind: 'clouds', label: 'Parçalı bulutlu' };
  if (code === 3) return { kind: 'overcast', label: 'Kapalı' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Sisli' };
  if (code >= 51 && code <= 57) return { kind: 'drizzle', label: 'Çiseliyor' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: 'rain', label: code >= 65 || code === 82 ? 'Kuvvetli yağmur' : 'Yağmurlu' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'Karlı' };
  if (code >= 95) return { kind: 'storm', label: 'Gök gürültülü fırtına' };
  return { kind: 'clouds', label: 'Bulutlu' };
}

let cache: { at: number; data: Weather } | null = null;
const TTL = 15 * 60_000;

async function location() {
  const v = await getStore().getState('location').catch(() => null);
  if (v) return { source: 'browser', ...JSON.parse(v) } as { lat: number; lon: number; place: string | null; source: string };
  const lat = Number(process.env.GUNES_LAT);
  const lon = Number(process.env.GUNES_LON);
  if (Number.isFinite(lat) && Number.isFinite(lon) && process.env.GUNES_LAT) return { lat, lon, place: null, source: 'env' };
  return { lat: 41.0082, lon: 28.9784, place: 'İstanbul', source: 'default' };
}

async function placeName(lat: number, lon: number) {
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=tr`,
      { signal: AbortSignal.timeout(6000) },
    );
    const j = (await r.json()) as { city?: string; locality?: string; principalSubdivision?: string };
    return j.city || j.locality || j.principalSubdivision || null;
  } catch {
    return null;
  }
}

export async function setLocation(lat: number, lon: number, manualPlace?: string, source: 'browser' | 'manual' = 'browser') {
  const prev = await location();
  // Konum ~1 km'den az değiştiyse adı yeniden sorma
  const moved = Math.abs(prev.lat - lat) > 0.01 || Math.abs(prev.lon - lon) > 0.01;
  const place = manualPlace || (moved || !prev.place ? await placeName(lat, lon) : prev.place);
  await getStore().setState('location', JSON.stringify({ lat: +lat.toFixed(4), lon: +lon.toFixed(4), place, source }));
  if (moved) cache = null;
}

export async function getWeather(force = false): Promise<Weather | null> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.data;
  const loc = await location();
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,is_day,cloud_cover,wind_speed_10m` +
    `&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as any;
    const c = j.current ?? {};
    const d = j.daily ?? {};
    const offset = Number(j.utc_offset_seconds ?? 0);
    // Open-Meteo yerel saat döner ("2026-11-02T07:12"); UTC'ye çevir
    const toIso = (s?: string) => (s ? new Date(new Date(`${s}:00Z`).getTime() - offset * 1000).toISOString() : null);
    const { kind, label } = describe(Number(c.weather_code ?? 0));
    const data: Weather = {
      place: loc.place,
      locationSource: loc.source,
      lat: loc.lat,
      lon: loc.lon,
      temp: Math.round(Number(c.temperature_2m ?? 0)),
      feelsLike: c.apparent_temperature !== undefined ? Math.round(Number(c.apparent_temperature)) : null,
      code: Number(c.weather_code ?? 0),
      kind,
      label,
      isDay: Boolean(c.is_day),
      cloudCover: c.cloud_cover ?? null,
      wind: c.wind_speed_10m ?? null,
      sunrise: toIso(d.sunrise?.[0]),
      sunset: toIso(d.sunset?.[0]),
      todayMax: d.temperature_2m_max?.[0] !== undefined ? Math.round(d.temperature_2m_max[0]) : null,
      todayMin: d.temperature_2m_min?.[0] !== undefined ? Math.round(d.temperature_2m_min[0]) : null,
      rainChance: d.precipitation_probability_max?.[0] ?? null,
      tomorrow:
        d.weather_code?.[1] !== undefined
          ? {
              ...describe(Number(d.weather_code[1])),
              max: d.temperature_2m_max?.[1] !== undefined ? Math.round(d.temperature_2m_max[1]) : null,
              min: d.temperature_2m_min?.[1] !== undefined ? Math.round(d.temperature_2m_min[1]) : null,
              rainChance: d.precipitation_probability_max?.[1] ?? null,
            }
          : null,
      updatedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    console.error('[güneş] hava durumu alınamadı:', (e as Error).message);
    return cache?.data ?? null;
  }
}
