// Geliştirme: sunucu (tsx watch) + arayüz (vite) birlikte
import { spawn } from 'node:child_process';
const isWin = process.platform === 'win32';
const run = (name, args) => {
  const p = spawn(isWin ? 'npm.cmd' : 'npm', ['run', name], { stdio: 'inherit', shell: isWin });
  p.on('exit', (c) => process.exit(c ?? 0));
  return p;
};
const procs = [run('dev:server'), run('dev:web')];
process.on('SIGINT', () => procs.forEach((p) => p.kill()));
console.log('\n☀️  Arayüz: http://localhost:5317  (API: 4317)\n');
