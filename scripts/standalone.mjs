import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// A second, self-contained deliverable can be opened directly without a dev server.
const dist = path.resolve('dist');
let html = await readFile(path.join(dist, 'index.html'), 'utf8');
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!script || !style) throw new Error('Expected one bundled script and stylesheet.');
async function asset(relative) {
  const file = path.resolve(dist, relative);
  if (!file.startsWith(dist + path.sep)) throw new Error('Asset must stay inside dist.');
  return readFile(file, 'utf8');
}
const js = await asset(script[1]), css = await asset(style[1]);
html = html.replace(script[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(style[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
html = html.replace('<a class="brand" href="./"', '<a class="brand" href="./play.html"');
await writeFile(path.join(dist, 'play.html'), html);
console.log('Standalone game: dist/play.html');
