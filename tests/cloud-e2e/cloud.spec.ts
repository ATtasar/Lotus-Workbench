import { test, expect, type Page } from '@playwright/test';
import { seedDatabase } from '../../src/data/seed';
const nav = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill('creator');
  await page.getByLabel('密码', { exact: true }).fill(process.env.STUDIO_E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
}
async function settled(page: Page) {
  await nav(page, '我的');
  await expect(page.locator('.data-summary').getByText('已保存', { exact: true })).toBeVisible();
  await expect(page.locator('.save-error')).toHaveCount(0);
}
test('cloud UI preserves local data, imports linked records and persists edits across login', async ({
  page,
  browser,
}) => {
  const legacy = seedDatabase();
  legacy.items[0].notes = 'original browser data';
  await page.goto('/');
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open('shijian-studio', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('data');
      r.onsuccess = () => {
        const tx = r.result.transaction('data', 'readwrite');
        tx.objectStore('data').put(data, 'workspace');
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, legacy);
  await login(page);
  await settled(page);
  await expect(page.getByText('0 笔订单 · 0 件物品', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入此浏览器原有记录', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
  await settled(page);
  const local = await page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const r = indexedDB.open('shijian-studio', 1);
        r.onsuccess = () => {
          const q = r.result.transaction('data').objectStore('data').get('workspace');
          q.onsuccess = () => {
            resolve(q.result);
            r.result.close();
          };
        };
      }),
  );
  expect(local).toEqual(legacy);
  await nav(page, '订单');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByLabel('订单名称 *', { exact: true }).fill('云端持久化订单');
  const upload = page.getByLabel('上传附件', { exact: true });
  await upload.setInputFiles({
    name: 'cloud.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('cloud attachment'),
  });
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await settled(page);
  await page.reload();
  await expect(page.getByRole('navigation')).toBeVisible();
  await nav(page, '订单');
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '云端持久化订单', exact: true }) })
    .click();
  await expect(page.getByRole('link', { name: 'cloud.txt' })).toBeVisible();
  await page.getByRole('button', { name: '绘制中', exact: true }).click();
  await settled(page);
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const otherPage = await other.newPage();
  await login(otherPage);
  const cloud = await otherPage.evaluate(
    async () => (await (await fetch('/api/workspace')).json()).data,
  );
  expect(cloud.orders.find((o: any) => o.name === '云端持久化订单').stage).toBe(1);
  expect(cloud.links).toEqual(legacy.links);
  expect(cloud.folders).toEqual(legacy.folders);
  expect(cloud.items[0].notes).toBe('original browser data');
  await other.close();
});
test('stale device changes are blocked and the unsaved draft survives refresh', async ({
  browser,
}) => {
  const a = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const b = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const first = await a.newPage(),
    second = await b.newPage();
  await login(first);
  await login(second);
  async function edit(page: Page, value: string) {
    await nav(page, '我的');
    await page.getByRole('button', { name: /编辑个人资料/ }).click();
    await page.getByLabel('称呼 *', { exact: true }).fill(value);
    await page.getByRole('dialog').getByRole('button', { name: '保存资料', exact: true }).click();
  }
  await edit(first, '已保存的云端名称');
  await settled(first);
  await edit(second, '另一设备未提交的名称');
  await expect(second.locator('.save-error')).toContainText('其他窗口或设备已修改');
  await second.reload();
  await expect(second.getByText(/云端版本已变化/)).toBeVisible();
  const download = second.waitForEvent('download');
  await second.getByRole('button', { name: '导出未提交草稿' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  second.once('dialog', (dialog) => dialog.accept());
  await second.getByRole('button', { name: '读取云端，放弃草稿' }).click();
  await expect(second.getByRole('navigation')).toBeVisible();
  await nav(second, '我的');
  await expect(
    second.getByRole('heading', { name: '已保存的云端名称', exact: true }),
  ).toBeVisible();
  await a.close();
  await b.close();
});
test('latest edits survive a network failure and are submitted on retry', async ({ page }) => {
  await login(page);
  await page.route('**/api/workspace/changesets', (route) => route.abort());
  async function editName(name: string) {
    await nav(page, '我的');
    await page.getByRole('button', { name: /编辑个人资料/ }).click();
    await page.getByLabel('称呼 *', { exact: true }).fill(name);
    await page.getByRole('button', { name: '保存资料', exact: true }).click();
  }
  await editName('网络失败后的第一次修改');
  await expect(page.locator('.save-error')).toBeVisible();
  await editName('需要恢复的最新草稿');
  await expect(page.locator('.save-error')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation')).toBeVisible();
  await nav(page, '我的');
  await expect(
    page.getByRole('heading', { name: '需要恢复的最新草稿', exact: true }),
  ).toBeVisible();
  await page.unrouteAll();
  await page.locator('.save-error').getByRole('button', { name: '重试', exact: true }).click();
  await settled(page);
  await page.reload();
  await nav(page, '我的');
  await expect(
    page.getByRole('heading', { name: '需要恢复的最新草稿', exact: true }),
  ).toBeVisible();
});
