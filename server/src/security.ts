/**
 * Yerel API koruması.
 *  - Host kontrolü: DNS rebinding'e karşı yalnızca localhost adlarına cevap verir.
 *  - Origin kontrolü: tarayıcıda açık BAŞKA bir sayfanın yerel API'ye POST/PATCH/DELETE atmasını (CSRF) engeller.
 *    Origin başlığı olmayan istekler (curl, Güneş'in kendi MCP sunucusu) geçer; tarayıcılar yazma isteklerinde
 *    Origin'i her zaman gönderir.
 */
import type { NextFunction, Request, Response } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function allowedHosts(port: number) {
  return new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
}

/** Güneş arayüzünün kendi kökenleri (Vite geliştirme sunucusu 5317 dahil). */
export function allowedOrigins(port: number, extra: string[] = []) {
  const hosts = ['localhost', '127.0.0.1', '[::1]'];
  const ports = [port, 5317, ...extra.map(Number).filter(Boolean)];
  return new Set(hosts.flatMap((h) => ports.map((p) => `http://${h}:${p}`)));
}

export function hostGuard(port: number) {
  const hosts = allowedHosts(port);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hosts.has(String(req.headers.host))) return void res.status(403).send('Forbidden');
    next();
  };
}

export function originGuard(port: number) {
  const origins = allowedOrigins(port);
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE.has(req.method)) return next();
    const origin = req.headers.origin;
    if (origin === undefined) {
      // Origin yoksa ama tarayıcı "cross-site" diyorsa yine reddet
      if (req.headers['sec-fetch-site'] === 'cross-site') return void res.status(403).json({ error: 'Yasak (cross-site)' });
      return next();
    }
    if (!origins.has(String(origin))) return void res.status(403).json({ error: 'Yasak: bilinmeyen köken' });
    next();
  };
}
