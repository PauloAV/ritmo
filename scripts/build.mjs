// Monta a pasta dist/ que vai para o GitHub Pages.
// Copia o site e gera dist/js/config.js a partir das variáveis de ambiente
// SUPABASE_URL e SUPABASE_ANON_KEY (que o GitHub Actions lê dos Secrets).
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltam as variáveis SUPABASE_URL e/ou SUPABASE_ANON_KEY.');
  process.exit(1);
}

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const item of ['index.html', 'css', 'js']) {
  cpSync(item, `dist/${item}`, { recursive: true });
}
rmSync('dist/js/config.example.js', { force: true });

writeFileSync(
  'dist/js/config.js',
  `export const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};\n` +
  `export const SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};\n`
);

console.log('Build pronto em dist/');
