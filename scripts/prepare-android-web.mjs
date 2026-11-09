import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'www');
const allowed = new Set([
  '.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.png',
  '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf',
  '.pdf', '.txt', '.xml'
]);
const excluded = [
  /^\.github\//, /^supabase\//, /^tests\//, /^docs\//,
  /^scripts\//, /^android\//, /^node_modules\//, /^\.git\//,
  /^README\.md$/i, /^LICENSE(?:\.|$)/i, /^package(?:-lock)?\.json$/i,
  /^capacitor\.config\./i
];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean)
  .filter(file => !excluded.some(pattern => pattern.test(file)))
  .filter(file => allowed.has(path.extname(file).toLowerCase()));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, file), destination);
}
if (files.length === 0 || !files.includes('index.html')) {
  throw new Error('No se encontró index.html en los recursos Android.');
}
console.log(`Recursos web empaquetados: ${files.length} archivos.`);
