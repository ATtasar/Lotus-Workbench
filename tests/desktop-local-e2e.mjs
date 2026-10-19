import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { serveLocal } from '../local-dist/server.mjs';

await fs.mkdir('artifacts', { recursive: true });
const root = await fs.mkdtemp(path.resolve('artifacts/desktop-ui-'));
const output = path.resolve('artifacts/desktop-validation');
await fs.mkdir(output, { recursive: true });
const port = 17845,
  base = `http://127.0.0.1:${port}`;
let service = await serveLocal({
  root,
  web: path.resolve('local-dist/web'),
  port,
  instance: 'desktop-ui-test',
});
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const errors = [],
  external = [];
let context;
async function newPage() {
  context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    timezoneId: 'Asia/Shanghai',
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(base + '/')) {
      external.push(url);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator('.sidebar').waitFor();
  return page;
}
async function state() {
  const { token } = await (
    await fetch(base + '/local-api/session', { headers: { 'X-Lotus-Local': '1' } })
  ).json();
  return (
    await (
      await fetch(base + '/local-api/desktop-workspace', {
        headers: { 'X-Lotus-Local': '1', 'X-Lotus-Token': token },
      })
    ).json()
  ).data;
}
async function stop() {
  const closed = once(service.server, 'close');
  service.close();
  await closed;
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
try {
  let page = await newPage();
  const action = async (name) => {
    const selector = `[data-action="${name}"]`;
    const dialog = page.getByRole('dialog');
    const target =
      (await dialog.isVisible()) && (await dialog.locator(selector).count())
        ? dialog.locator(selector)
        : page.locator(selector);
    await target.first().click();
  };
  const nav = (name) => page.locator(`.nav [data-page="${name}"]`).click();
  const saved = () =>
    page.waitForFunction(
      () => document.querySelector('#save-status')?.textContent === '已保存到电脑',
    );
  const upload = async (name) => {
    const chooser = page.waitForEvent('filechooser');
    await action(name);
    await (await chooser).setFiles({ name: '参考图.png', mimeType: 'image/png', buffer: png });
  };
  const initial = await state();
  for (const key of ['platforms', 'clients', 'orders', 'templates', 'assets', 'toolTemplates'])
    assert.equal(initial[key].length, 0);
  const bounds = await page.evaluate(() => ({
    sidebar: document.querySelector('.sidebar').getBoundingClientRect().width,
    content: document.querySelector('.shell').getBoundingClientRect().width,
    phoneShell: !!document.querySelector('.app-shell'),
  }));
  assert.equal(bounds.sidebar, 224);
  assert.ok(bounds.content > 1000);
  assert.equal(bounds.phoneShell, false);
  await page.screenshot({ path: path.join(output, 'desktop-blank.png'), fullPage: true });
  await nav('clients');
  await action('new-client');
  await page.locator('[name=name]').fill('电脑端测试单主');
  await page.locator('[name=preferences]').fill('保留留白');
  await action('inline-platform');
  await page.locator('#new-platform-name').fill('测试平台');
  await action('save-inline-platform');
  await page.locator('button[form=client-form]').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();

  await nav('templates');
  await action('new-template');
  await page.locator('[name=title]').fill('电脑端头像模板');
  await page.locator('[name=category]').fill('头像');
  await page.locator('[name=deposit]').fill('100');
  await page.locator('[name=balance]').fill('200');
  await page.locator('#save-order-btn').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await nav('orders');
  await action('new-order');
  await page.locator('#order-template').selectOption({ label: '电脑端头像模板' });
  await page.locator('[name=title]').fill('本地电脑端稿件');
  await page.locator('[name=client]').selectOption({ label: '电脑端测试单主' });
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  await page.locator('[name=due]').fill(date);
  await page.locator('[name=requirements]').fill('电脑端稿件要求');
  await upload('upload-draft');
  await page.locator('.upload-preview img').waitFor();
  await page.locator('#save-order-btn').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  await page.locator('tbody [data-action=order-detail]').first().click();
  await action('edit-order');
  await page.locator('[name=notes]').fill('编辑后保存');
  await page.locator('#save-order-btn').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  await nav('calendar');
  assert.equal(
    await page.locator('.event strong').filter({ hasText: '本地电脑端稿件' }).count(),
    1,
  );
  assert.match(await page.locator('.income-total').innerText(), /100/);
  await nav('clients');
  await page.locator('[data-action=client-detail]').first().click();
  assert.match(await page.getByRole('dialog').innerText(), /本地电脑端稿件/);
  await action('close-modal');
  await nav('home');
  assert.match(await page.locator('.current-body').innerText(), /电脑端稿件要求/);
  await page.screenshot({ path: path.join(output, 'desktop-home.png'), fullPage: true });
  await nav('tools');
  await upload('upload-assets');
  await page.locator('.asset-item img').waitFor();
  await saved();
  for (const kind of ['receipt', 'card', 'watermark', 'layout']) {
    await page.locator(`[data-action=open-tool][data-tool=${kind}]`).click();
    if (kind === 'receipt' || kind === 'card') {
      assert.equal(await page.locator('[data-tool-field=customer]').inputValue(), '电脑端测试单主');
      await page.locator('[data-tool-field=name]').fill(kind + '测试模板');
      await action('save-tool-template');
      await saved();
      const download = page.waitForEvent('download');
      await action(kind === 'receipt' ? 'export-pdf' : 'export-png');
      const file = await download;
      await file.saveAs(path.join(output, file.suggestedFilename()));
      assert.ok((await fs.stat(path.join(output, file.suggestedFilename()))).size > 100);
    } else if (kind === 'watermark') {
      await upload('upload-mark');
      await page.locator('[data-drop=watermark-mark] img').waitFor();
      await saved();
      await upload('upload-base');
      await page.locator('[data-drop=watermark-image] img').waitFor();
      const file = page.waitForEvent('download');
      await action('export-png');
      await (await file).saveAs(path.join(output, 'watermark.png'));
      await action('clear-base');
      assert.equal(await page.locator('[data-drop=watermark-mark] img').count(), 1);
    } else {
      await upload('upload-layout');
      await page.locator('#layout-template-name').fill('电脑端排版模板');
      await action('save-layout-template');
      await saved();
    }
    await action('tools-back');
  }
  await action('settings');
  await action('backup-local');
  await page.waitForFunction(() =>
    document.querySelector('#toast').textContent.includes('数据库与图片已备份'),
  );
  assert.ok((await fs.readdir(path.join(root, 'backups'))).length > 0);
  const download = page.waitForEvent('download');
  await action('backup-export');
  await (await download).saveAs(path.join(output, 'test-backup.json'));
  const before = await state();
  await action('backup-import');
  await page.locator('#global-file').setInputFiles(path.join(output, 'test-backup.json'));
  await page.getByRole('dialog').filter({ hasText: '导入并替换工作台' }).waitFor();
  assert.deepEqual(await state(), before); // Merely choosing a file must not replace anything.
  await action('confirm-action');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  assert.deepEqual(await state(), before);
  await context.close();
  await stop();
  service = await serveLocal({
    root,
    web: path.resolve('local-dist/web'),
    port,
    instance: 'desktop-restart-test',
  });
  page = await newPage();
  assert.deepEqual(await state(), before);
  assert.match(await page.locator('.current-body').innerText(), /编辑后保存/);
  await action('settings');
  await action('import-browser');
  await page.waitForFunction(() =>
    document.querySelector('#toast').textContent.includes('未找到旧电脑端记录'),
  );
  assert.deepEqual(await state(), before);
  const legacy = structuredClone(before);
  legacy.orders[0].title = '从原电脑网页导入的稿件';
  await page.evaluate(
    (value) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('still-commission-workbench-blank-v1', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('state');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('state', 'readwrite');
          tx.objectStore('state').put(value, 'workspace');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    legacy,
  );
  await action('import-browser');
  await page.getByRole('dialog').filter({ hasText: '导入并替换工作台' }).waitFor();
  assert.deepEqual(await state(), before);
  await action('confirm-action');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  assert.deepEqual(await state(), legacy);
  const source = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('still-commission-workbench-blank-v1', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            read = db.transaction('state').objectStore('state').get('workspace');
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );
  assert.deepEqual(source, legacy);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        ui: 'original-desktop-blank',
        root,
        bounds,
        external,
        errors,
        checked: [
          'blank initialization',
          'desktop width and left navigation',
          'client/platform/template/order create and edit',
          'private image persistence',
          'calendar and client associations',
          'receipt PDF and card PNG',
          'watermark and layout templates',
          'full physical backup',
          'JSON confirmed restore',
          'browser and service restart persistence',
          'confirmed legacy IndexedDB migration preserves source',
          'all external HTTP blocked',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS original desktop UI, linked workflows, local image files, exports, backups and restart persistence',
  );
} finally {
  await browser.close();
  await stop();
}
