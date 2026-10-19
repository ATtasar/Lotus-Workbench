// Maintainer utility; the generated icon is shipped with the source ZIP.
// Windows 10/11 ICO supports a PNG image payload. No execution policy changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const browser = await chromium.launch({
  executablePath: path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
  headless: true,
  timeout: 15000,
});
let png;
try {
  const page = await browser.newPage();
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle='#181818'; ctx.beginPath(); ctx.roundRect(0,0,256,256,38); ctx.fill();
    ctx.font='700 148px "Microsoft YaHei", sans-serif';ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('稿',128,135);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  png = Buffer.from(data, 'base64');
} finally { await browser.close(); }
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await fs.writeFile(path.join(root, 'desktop/workbench.ico'), Buffer.concat([header, png]));
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
await fs.writeFile(path.join(root, 'artifacts/workbench-icon.png'), png);
console.log('已生成 desktop/workbench.ico');
