import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [html, css, js] = await Promise.all(
  ['index.html', 'styles.css', 'app.js'].map(name => fs.readFile(path.join(root, 'src', name), 'utf8')),
);
if (!html.includes('href="styles.css"') || !html.includes('src="app.js"')) {
  throw new Error('网页入口缺少样式或脚本引用。');
}
const output = html
  .replace(/<link rel="stylesheet" href="styles.css"\s*\/?>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script src="app.js" defer><\/script>/, '')
  .replace('</body>', () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n</body>`);
await fs.writeFile(path.join(root, 'index.html'), output, 'utf8');
await fs.writeFile(path.join(root, '.nojekyll'), '', 'utf8');
process.stdout.write('网站已构建：index.html\n');
