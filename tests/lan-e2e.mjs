import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { serveLocal } from '../local-dist/server.mjs';
import { lanInterfaces } from '../local-dist/lan.mjs';

const adapter = lanInterfaces()[0];
if (!adapter) throw new Error('本机没有可测试的私网 IPv4，不能声称 LAN 实测通过。');
await fs.mkdir('artifacts', { recursive: true });
const root = await fs.mkdtemp(path.resolve('artifacts/lan-ui-'));
const output = path.resolve('artifacts/lan-validation');
await fs.mkdir(output, { recursive: true });
const port = 17849,
  local = `http://127.0.0.1:${port}`,
  remote = `http://${adapter.address}:${port}`;
let service = await serveLocal({
  root,
  web: path.resolve('local-dist/web'),
  port,
  instance: 'lan-browser-test',
});
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const errors = [],
  external = [];
const pcContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: 'Asia/Shanghai',
});
let phoneContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  timezoneId: 'Asia/Shanghai',
});
async function guard(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(local + '/') && !url.startsWith(remote + '/')) {
      external.push(url);
      return route.abort();
    }
    return route.continue();
  });
}
await guard(pcContext);
await guard(phoneContext);
const desktop = await pcContext.newPage();
let phone = await phoneContext.newPage();
for (const page of [desktop, phone]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(15000);
}
async function action(page, name) {
  const selector = `[data-action="${name}"]`,
    dialog = page.getByRole('dialog');
  const locator =
    (await dialog.isVisible()) && (await dialog.locator(selector).count())
      ? dialog.locator(selector)
      : page.locator(selector);
  await locator.first().click();
}
const nav = (page, name) => page.locator(`.nav [data-page=${name}]`).click();
const saved = (page) =>
  page.waitForFunction(
    () => document.querySelector('#save-status')?.textContent === '已保存到电脑',
  );
const noDialog = (page) => page.getByRole('dialog').waitFor({ state: 'hidden' });
async function state() {
  const { token } = await (
    await fetch(local + '/local-api/session', {
      headers: { 'X-Lotus-Local': '1', Connection: 'close' },
    })
  ).json();
  return await (
    await fetch(local + '/local-api/desktop-workspace', {
      headers: { 'X-Lotus-Local': '1', 'X-Lotus-Token': token, Connection: 'close' },
    })
  ).json();
}
async function stop() {
  const closed = once(service.server, 'close');
  service.close();
  await closed;
}
try {
  await desktop.goto(local);
  await desktop.locator('.sidebar').waitFor();
  await action(desktop, 'settings');
  await action(desktop, 'lan-settings');
  await desktop.locator('[name=lan-enabled]').check();
  await desktop.locator('[name=lan-address]').selectOption(adapter.address);
  // Only this computer's own address is allowed in the test. No phone or
  // other LAN device gains access to this isolated temporary workspace.
  await desktop.locator('[name=lan-phones]').fill(adapter.address);
  await desktop.locator('#lan-form button[type=submit]').click();
  await desktop
    .getByRole('dialog')
    .getByText(remote + '/mobile/', { exact: true })
    .waitFor();
  await action(desktop, 'lan-code');
  await desktop.locator('#lan-pairing-code').filter({ hasText: /\d{8}/ }).waitFor();
  const code = (await desktop.locator('#lan-pairing-code').textContent()).match(/\d{8}/)[0];
  await phone.goto(remote + '/mobile/');
  await phone.locator('#pair-form').waitFor();
  await phone.locator('[name=pair-code]').fill(code);
  await phone.locator('#pair-submit').click();
  await phone.locator('.mobile-tabs').waitFor();
  assert.equal(await phone.locator('.nav [data-page=storage]').count(), 0);
  assert.equal(await phone.locator('.mobile-tabs button').count(), 6);
  await phone.screenshot({ path: path.join(output, 'mobile-blank.png'), fullPage: true });
  await action(desktop, 'close-modal');
  await nav(phone, 'clients');
  await action(phone, 'new-client');
  await phone.locator('[name=name]').fill('联动测试单主');
  await phone.locator('[name=preferences]').fill('保留稿件偏好');
  await action(phone, 'inline-platform');
  await phone.locator('#new-platform-name').fill('联动平台');
  await action(phone, 'save-inline-platform');
  await phone.locator('[name=platforms]:checked').waitFor();
  await saved(phone);
  await phone.locator('button[form=client-form]').click();
  await noDialog(phone);
  await saved(phone);
  await nav(phone, 'orders');
  await action(phone, 'new-order');
  await phone.locator('[name=title]').fill('手机新增稿件');
  await phone.locator('[name=client]').selectOption({ label: '联动测试单主' });
  await phone.locator('[name=category]').fill('头像');
  await phone.locator('[name=deposit]').fill('100');
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  await phone.locator('[name=due]').fill(today);
  const chooser = phone.waitForEvent('filechooser');
  await action(phone, 'upload-draft');
  await (
    await chooser
  ).setFiles({
    name: '例图.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await phone.locator('.upload-preview img').waitFor();
  await phone.locator('#save-order-btn').click();
  await noDialog(phone);
  await saved(phone);
  assert.equal((await state()).data.orders[0].title, '手机新增稿件');
  await desktop.bringToFront();
  await nav(desktop, 'orders');
  await desktop.locator('tbody tr').filter({ hasText: '手机新增稿件' }).waitFor();
  assert.equal((await state()).data.orders[0].images.length, 1);
  await action(desktop, 'edit-order');
  await desktop.locator('[name=title]').fill('电脑修改稿件');
  await desktop.locator('#save-order-btn').click();
  await noDialog(desktop);
  await saved(desktop);
  await phone.bringToFront();
  await phone.locator('.mobile-order-card h3').filter({ hasText: '电脑修改稿件' }).waitFor();
  console.log(
    'PASS phone creates and desktop edits the same commission through LAN API and automatic refresh',
  );
  // Keep a desktop editor open while the phone commits a newer revision.
  await desktop.bringToFront();
  await action(desktop, 'edit-order');
  await desktop.locator('[name=title]').fill('电脑尚未保存的输入');
  await phone.bringToFront();
  await action(phone, 'edit-order');
  await phone.locator('[name=title]').fill('手机优先提交');
  await phone.locator('#save-order-btn').click();
  await noDialog(phone);
  await saved(phone);
  await desktop.bringToFront();
  await desktop.waitForFunction(() =>
    document.querySelector('#save-status').textContent.includes('另一端有更新'),
  );
  assert.equal(await desktop.locator('[name=title]').inputValue(), '电脑尚未保存的输入');
  await desktop.locator('#save-order-btn').click();
  await desktop.waitForFunction(() =>
    document.querySelector('#save-status').textContent.includes('保存失败'),
  );
  assert.equal((await state()).data.orders[0].title, '手机优先提交');
  assert.equal(await desktop.locator('[name=title]').inputValue(), '电脑尚未保存的输入');
  await desktop.reload();
  await desktop.locator('.sidebar').waitFor();
  await nav(desktop, 'orders');
  await desktop.locator('tbody tr').filter({ hasText: '手机优先提交' }).waitFor();
  // A failed Wi-Fi request must not report a successful commit.
  await phone.bringToFront();
  await action(phone, 'edit-order');
  await phone.locator('[name=title]').fill('断网未保存');
  await phoneContext.setOffline(true);
  await phone.locator('#save-order-btn').click();
  await phone.waitForFunction(() =>
    document.querySelector('#save-status').textContent.includes('保存失败'),
  );
  assert.equal((await state()).data.orders[0].title, '手机优先提交');
  await phoneContext.setOffline(false);
  await phone.reload();
  await phone.locator('.mobile-tabs').waitFor();
  await nav(phone, 'orders');
  await phone.locator('.mobile-order-card h3').filter({ hasText: '手机优先提交' }).waitFor();
  const snapshot = await state(),
    cookies = await phoneContext.storageState();
  await desktop.screenshot({ path: path.join(output, 'desktop-linked.png'), fullPage: true });
  await phone.screenshot({ path: path.join(output, 'mobile-linked.png'), fullPage: true });
  await phoneContext.close();
  await stop();
  service = await serveLocal({
    root,
    web: path.resolve('local-dist/web'),
    port,
    instance: 'lan-browser-restart',
  });
  phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Asia/Shanghai',
    storageState: cookies,
  });
  await guard(phoneContext);
  phone = await phoneContext.newPage();
  phone.on('pageerror', (error) => errors.push(error.message));
  await phone.goto(remote + '/mobile/');
  await phone.locator('.mobile-tabs').waitFor();
  await nav(phone, 'orders');
  assert.deepEqual(await state(), snapshot);
  await phone.locator('.mobile-order-card h3').filter({ hasText: '手机优先提交' }).waitFor();
  await desktop.reload();
  await desktop.locator('.sidebar').waitFor();
  await action(desktop, 'settings');
  await action(desktop, 'lan-settings');
  await action(desktop, 'lan-revoke');
  await phone.bringToFront();
  await action(phone, 'edit-order');
  await phone.locator('[name=notes]').fill('撤销授权后不应写入');
  await phone.locator('#save-order-btn').click();
  await phone.waitForFunction(() =>
    document.querySelector('#save-status').textContent.includes('保存失败'),
  );
  assert.deepEqual(await state(), snapshot);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        root,
        local,
        remote,
        checks: [
          'retained desktop and mobile layouts',
          'GUI LAN configuration and pairing',
          'phone creates order and image visible on PC',
          'PC edits visible on phone via polling',
          'draft preserved and stale save refused',
          'network failure does not report saved',
          'browser and service restart preserves records, images and device pairing',
          'revoked device cannot write',
          'no external requests',
          'no storage/folder navigation',
        ],
        physicalPhone: 'not-tested',
        physicalReboot: 'not-tested',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS draft-safe polling, conflict detection, network errors, private images, restart and revoked-device protection',
  );
} catch (error) {
  await desktop
    .screenshot({ path: path.join(output, 'desktop-failure.png'), fullPage: true })
    .catch(() => {});
  await phone
    .screenshot({ path: path.join(output, 'mobile-failure.png'), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await stop();
}
