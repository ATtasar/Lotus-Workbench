import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const [shell, base, style, core, mobile] = await Promise.all(
  ['index.html', 'base.css', 'mobile.css', 'core.js', 'mobile.js'].map(name =>
    fs.readFile(path.join(root, 'src', name), 'utf8'),
  ),
);
const point = core.lastIndexOf('  boot()');
if (point < 0) throw new Error('未找到手机版启动位置。');
if (!shell.includes('href="styles.css"') || !shell.includes('src="app.js"')) {
  throw new Error('手机版入口缺少样式或脚本引用。');
}
const app = core.slice(0, point) + '\n' + mobile + '\n' + core.slice(point);
const output = shell
  .replace(/<link rel="stylesheet" href="styles.css"\s*\/?>/, () => `<style>\n${base}\n${style}\n</style>`)
  .replace(/^[ \t]*<script src="app.js" defer><\/script>[ \t]*\r?\n/m, '')
  .replace('</body>', () => `<script>\n${app.replace(/<\/script/gi, '<\\/script')}\n</script>\n</body>`);
await fs.writeFile(path.join(root, 'index.html'), output, 'utf8');
process.stdout.write('手机版已构建：mobile/index.html\n');
