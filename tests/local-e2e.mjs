import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const base = process.env.LOCAL_TEST_URL || 'http://127.0.0.1:17844';
await fs.mkdir('artifacts', { recursive: true });
const dataRoot = process.env.LOCAL_TEST_ROOT
  ? path.resolve(process.env.LOCAL_TEST_ROOT)
  : await fs.mkdtemp(path.resolve('artifacts/local-ui-'));
const ownedService = process.env.LOCAL_TEST_URL
  ? null
  : await (
      await import('../local-dist/server.mjs')
    ).serveLocal({
      root: dataRoot,
      web: path.resolve('local-dist/web'),
      port: 17844,
      instance: 'ui-test',
    });
const browser = await chromium.launch({
  executablePath:
    process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const remote = [],
  errors = [];
let context, page;
async function open() {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    remote.push(url.href);
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await expect(page.getByRole('heading', { name: '收纳展示' })).toBeVisible();
}
async function snapshot() {
  return page.evaluate(async () => {
    const session = await (
      await fetch('/local-api/session', { headers: { 'X-Lotus-Local': '1' } })
    ).json();
    return (
      await fetch('/local-api/workspace', {
        headers: { 'X-Lotus-Local': '1', 'X-Lotus-Token': session.token },
      })
    ).json();
  });
}
async function nav(name) {
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name, exact: true })
    .click();
  if (name === '订单') await page.getByRole('tab', { name: '订单整理', exact: true }).click();
}
async function save() {
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function committed(check) {
  await expect.poll(async () => check((await snapshot()).data)).toBe(true);
}
try {
  await open();
  assert.equal((await snapshot()).data.orders.length, 0);
  await nav('订单');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByLabel('订单名称 *', { exact: true }).fill('本地验收订单');
  await page.getByLabel('买家 / 卖家 / 委托方', { exact: true }).fill('本地交易对象');
  await save();
  await committed((d) => d.orders.some((o) => o.name === '本地验收订单'));
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '本地验收订单', exact: true }) })
    .click();
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  await page.getByLabel('订单名称 *', { exact: true }).fill('本地订单已编辑');
  await save();
  await committed((d) => d.orders.some((o) => o.name === '本地订单已编辑'));
  console.log('PASS existing order UI creates and edits real SQLite records');
  await nav('收纳');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: /新建文件夹/ }).click();
  await page.getByLabel('名称 *', { exact: true }).fill('本地一级目录');
  await page.getByRole('button', { name: '评2星', exact: true }).click();
  await page.getByLabel('文字评价', { exact: true }).fill('一级目录评价');
  await save();
  await page.getByRole('button', { name: '本地一级目录', exact: true }).click();
  for (const name of ['本地二级目录', '本地三级目录']) {
    await page.getByRole('button', { name: '子文件夹', exact: true }).click();
    await page.getByLabel('名称 *', { exact: true }).fill(name);
    await save();
    await page.getByRole('button', { name, exact: true }).click();
  }
  await page.getByRole('button', { name: '添加物品', exact: true }).click();
  await page.getByLabel('物品名称 *', { exact: true }).fill('本地图片与评价');
  await page.getByRole('button', { name: '评4星', exact: true }).click();
  await page.getByLabel('文字评价', { exact: true }).fill('持久保存物品评价');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hD8AAAAASUVORK5CYII=',
    'base64',
  );
  await page
    .getByLabel('上传附件', { exact: true })
    .setInputFiles({ name: '本地例图.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.attachment-thumb')).toHaveCount(1);
  await save();
  await committed((d) => d.folders.length === 3 && d.items[0]?.attachments.length === 1);
  const data = (await snapshot()).data;
  assert.equal(data.folders[1].parentId, data.folders[0].id);
  assert.equal(data.folders[2].parentId, data.folders[1].id);
  assert.equal(data.items[0].folderId, data.folders[2].id);
  assert.equal(data.items[0].rating, 4);
  assert.equal(data.folders[0].rating, 2);
  assert.equal(data.items[0].review, '持久保存物品评价');
  assert.equal(
    (await fs.readdir(path.join(dataRoot, 'data/files'))).filter((n) => /^[a-f0-9]{64}$/.test(n))
      .length,
    1,
  );
  console.log('PASS three nested folders, independent ratings/reviews and stable image files');
  await context.close();
  await open();
  await nav('我的');
  await expect(page.getByText('数据保存在本机 SQLite。')).toBeVisible();
  const reloaded = (await snapshot()).data;
  assert.deepEqual(reloaded, data);
  await page.getByRole('button', { name: '备份数据库与附件', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('备份已保存');
  const archives = (await fs.readdir(path.join(dataRoot, 'backups'))).filter(
    (n) => !n.endsWith('.pending'),
  );
  assert.ok(archives.length > 0);
  console.log(
    'PASS browser close/reopen reads the same database, and settings creates a physical full backup',
  );
  await fs.mkdir('artifacts/local-validation', { recursive: true });
  await page.screenshot({ path: 'artifacts/local-validation/settings.png', fullPage: true });
  assert.deepEqual(remote, []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS core operations with every non-loopback request blocked; no external requests or page errors',
  );
  await fs.writeFile(
    'artifacts/local-validation/ui-result.json',
    JSON.stringify(
      {
        passed: true,
        checks: [
          'order-create-edit',
          'nested-folders',
          'ratings-reviews',
          'image-files',
          'browser-reopen',
          'full-backup',
          'block-external-network',
        ],
        physicalReboot: 'not-run',
        physicalNetworkDisconnect: 'not-run',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  if (ownedService) {
    const closed = new Promise((resolve) => ownedService.server.once('close', resolve));
    ownedService.close();
    await closed;
  }
}
