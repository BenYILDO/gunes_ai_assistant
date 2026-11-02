import { motion } from 'motion/react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Cloudy, Moon, Sun, type LucideIcon } from 'lucide-react';
import type { Weather, WeatherKind } from '../lib/api';
import { fmtTime } from '../lib/time';

export const WEATHER_ICON: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  clouds: Cloud,
  overcast: Cloudy,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

export function WeatherChip({ weather }: { weather: Weather | null }) {
  if (!weather) return null;
  const Icon = weather.kind === 'clear' && !weather.isDay ? Moon : WEATHER_ICON[weather.kind];
  const title = [
    weather.place,
    `${weather.label}, ${weather.temp}°C${weather.feelsLike !== null ? ` (hissedilen ${weather.feelsLike}°)` : ''}`,
    weather.todayMax !== null ? `En yüksek ${weather.todayMax}° · en düşük ${weather.todayMin}°` : '',
    weather.rainChance !== null ? `Yağış ihtimali %${weather.rainChance}` : '',
    weather.sunrise ? `Gün doğumu ${fmtTime(weather.sunrise)} · batımı ${fmtTime(weather.sunset)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      title={title}
      className="hidden items-center gap-1.5 rounded-xl border border-line bg-white/[0.04] px-2.5 py-1.5 text-xs text-ink-dim xl:flex"
    >
      <motion.span animate={{ y: [0, -1.5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
        <Icon size={15} className="text-accent" />
      </motion.span>
      <span className="font-display text-sm font-semibold tabular-nums text-ink">{weather.temp}°</span>
      <span className="max-w-[90px] truncate">{weather.label}</span>
    </motion.div>
  );
}
