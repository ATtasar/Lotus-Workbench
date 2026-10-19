import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Database } from '../../src/data/types';
import { addDays } from '../../src/lib/date';

const errors = new WeakMap<Page, string[]>();
async function data(page: Page): Promise<Database> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('shijian-studio', 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction('data').objectStore('data').get('workspace');
          q.onsuccess = () => {
            db.close();
            resolve(q.result);
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
}
async function orders(page: Page) {
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name: '订单', exact: true })
    .click();
}
async function module(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}
async function save(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function confirm(page: Page) {
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  const found: string[] = [];
  errors.set(page, found);
  page.on('pageerror', (e) => found.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') found.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '收纳展示' })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('six functional sections use monochrome, no finance panels or decorative copy', async ({
  page,
}) => {
  await mkdir('artifacts', { recursive: true });
  await expect(page.locator('.home-brand .brand-seal')).toHaveText('');
  expect(
    await page
      .locator('.home-brand .brand-seal')
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgb(229, 53, 69)');
  await orders(page);
  await expect(page.getByRole('tab', { name: '项目排单' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('EVERY CREATION HAS A STORY')).toHaveCount(0);
  await expect(page.getByText('把每一份托付，好好完成。')).toHaveCount(0);
  const labels = ['项目排单', '订单整理', '订单日历', '交易对象', '订单模板', '作品画廊'];
  for (const [index, label] of labels.entries()) {
    await module(page, label);
    await expect(page.locator('.workspace-section-heading h2')).toHaveText(label);
    if (label === '订单日历')
      await expect(page.getByRole('region', { name: '日历收入支出汇总' })).toBeVisible();
    else await expect(page.getByText(/收入|支出|¥|￥/)).toHaveCount(0);
    await page.screenshot({ path: `artifacts/workspace-${index + 1}.png`, fullPage: true });
    for (const width of [320, 390, 595]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await module(page, '项目排单');
  const color = await page
    .getByRole('tab', { name: '项目排单' })
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(color).toBe('rgb(25, 25, 25)');
});

test('queue order and project dates persist and sync to the order calendar', async ({ page }) => {
  await orders(page);
  const initial = (await data(page)).orders.sort((a, b) => a.queuePosition - b.queuePosition);
  const first = initial[0];
  await page.getByRole('button', { name: `下移项目${first.name}`, exact: true }).click();
  await expect(page.locator('.queue-card h3').first()).toHaveText(initial[1].name);
  await expect
    .poll(async () => (await data(page)).orders.find((o) => o.id === first.id)?.queuePosition)
    .toBe(1);
  await page.reload();
  await orders(page);
  await expect(page.locator('.queue-card h3').first()).toHaveText(initial[1].name);
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  const due = addDays(today, 7);
  await page.getByRole('button', { name: `调整${first.name}排期` }).click();
  await page.getByLabel('开始日期', { exact: true }).fill(today);
  await page.getByLabel('截止日期', { exact: true }).fill(due);
  await save(page);
  await expect
    .poll(async () => (await data(page)).orders.find((o) => o.id === first.id)?.dueDate)
    .toBe(due);
  await module(page, '订单日历');
  if (due.slice(0, 7) !== today.slice(0, 7))
    await page.getByRole('button', { name: '下一订单日历周期' }).click();
  await page.getByRole('button', { name: `${due} 有日程`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: `${first.name} · 约定截止 全天 · 订单日程`, exact: true }),
  ).toBeVisible();
});

test('counterparty CRUD, booking platform and order binding preserve order snapshots', async ({
  page,
}) => {
  await orders(page);
  await module(page, '交易对象');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: '基本资料', exact: true }).click();
  await page.getByLabel('对象名称 *', { exact: true }).fill('测试预约对象');
  await page.getByLabel('预约 / 来源平台', { exact: true }).selectOption('米画师');
  await page.getByLabel('联系方式', { exact: true }).fill('contact-001');
  await save(page);
  await page
    .getByRole('button')
    .filter({ has: page.getByText('测试预约对象', { exact: true }) })
    .click();
  await page.getByRole('button', { name: '关联订单', exact: true }).click();
  await page.getByRole('button', { name: '管理订单关联' }).click();
  const order = (await data(page)).orders[0];
  await page.getByRole('dialog').getByRole('button').filter({ hasText: order.name }).click();
  await page.getByRole('button', { name: '保存关联', exact: true }).click();
  await expect.poll(async () => (await data(page)).orders[0].party).toBe('测试预约对象');
  await page.getByRole('button', { name: '关联订单', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button').filter({ hasText: order.name }),
  ).toBeVisible();
  await page.getByRole('button', { name: '返回档案', exact: true }).click();
  await page.getByRole('button', { name: '基本资料', exact: true }).click();
  await page.getByLabel('对象名称 *', { exact: true }).fill('测试预约对象已更新');
  await save(page);
  await expect.poll(async () => (await data(page)).orders[0].party).toBe('测试预约对象已更新');
  await page
    .getByRole('button')
    .filter({ has: page.getByText('测试预约对象已更新', { exact: true }) })
    .click();
  await page.getByRole('button', { name: '删除交易对象', exact: true }).click();
  await confirm(page);
  await expect.poll(async () => (await data(page)).orders[0].counterpartyId).toBeNull();
  expect((await data(page)).orders[0].party).toBe('测试预约对象已更新');
  expect((await data(page)).orders[0].contact).toBe('contact-001');
});

test('order template CRUD generates independent editable orders and dated tasks', async ({
  page,
}) => {
  await orders(page);
  await module(page, '订单模板');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByLabel('模板名称 *', { exact: true }).fill('测试三日委托模板');
  await page.getByLabel('默认工期（天）', { exact: true }).fill('3');
  await page.getByLabel('进度步骤 *', { exact: true }).fill('已确认 / 绘制中 / 已完成');
  await page.getByLabel('默认任务节点', { exact: true }).fill('草稿确认 | 1\n最终交付 | 3');
  await save(page);
  const card = page
    .locator('.template-card')
    .filter({ has: page.getByRole('heading', { name: '测试三日委托模板', exact: true }) });
  await card.getByRole('button', { name: '使用模板', exact: true }).click();
  await page.getByLabel('订单名称 *', { exact: true }).fill('由模板创建的订单');
  const start = await page.getByLabel('开始日期', { exact: true }).inputValue();
  await expect(page.getByLabel('约定截止日期', { exact: true })).toHaveValue(addDays(start, 3));
  await save(page);
  await expect
    .poll(async () => (await data(page)).orders.some((o) => o.name === '由模板创建的订单'))
    .toBe(true);
  const db = await data(page);
  const order = db.orders.find((o) => o.name === '由模板创建的订单')!;
  expect(db.tasks.filter((t) => t.orderId === order.id).map((t) => [t.name, t.date])).toEqual([
    ['草稿确认', addDays(start, 1)],
    ['最终交付', addDays(start, 3)],
  ]);
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('模板名称 *', { exact: true }).fill('修改后的委托模板');
  await save(page);
  await page
    .locator('.template-card')
    .filter({ has: page.getByRole('heading', { name: '修改后的委托模板', exact: true }) })
    .getByRole('button', { name: '删除', exact: true })
    .click();
  await confirm(page);
  await expect
    .poll(async () => (await data(page)).templates.some((t) => t.name === '修改后的委托模板'))
    .toBe(false);
  expect((await data(page)).tasks.filter((t) => t.orderId === order.id)).toHaveLength(2);
  expect((await data(page)).orders.find((o) => o.id === order.id)?.steps).toEqual([
    '已确认',
    '绘制中',
    '已完成',
  ]);
});

test('gallery records images, category and associated order and survives refresh', async ({
  page,
}) => {
  await orders(page);
  await module(page, '作品画廊');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByLabel('作品名称 *', { exact: true }).fill('测试手作作品');
  await page.getByLabel('作品分类', { exact: true }).selectOption('手作');
  await page.getByLabel('作品说明', { exact: true }).fill('测试作品说明');
  const db = await data(page);
  await page.getByLabel('关联订单', { exact: true }).selectOption(db.orders[0].id);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hD8AAAAASUVORK5CYII=',
    'base64',
  );
  await page
    .getByLabel('上传附件', { exact: true })
    .setInputFiles({ name: 'work.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.attachment-thumb')).toHaveCount(1);
  await save(page);
  await expect
    .poll(
      async () =>
        (await data(page)).works.find((w) => w.name === '测试手作作品')?.attachments.length,
    )
    .toBe(1);
  await page.reload();
  await orders(page);
  await module(page, '作品画廊');
  await page.getByRole('button', { name: '手作', exact: true }).click();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '测试手作作品', exact: true }) })
    .click();
  await expect(page.getByRole('dialog')).toContainText('测试作品说明');
  await expect(page.getByRole('dialog')).toContainText(db.orders[0].name);
  await page.getByRole('button', { name: '预览work.png' }).click();
  await expect(page.getByRole('dialog', { name: '图片预览' })).toBeVisible();
  await page.getByRole('button', { name: '关闭预览' }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('作品名称 *', { exact: true }).fill('测试手作作品已编辑');
  await save(page);
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '测试手作作品已编辑', exact: true }) })
    .click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: '删除作品', exact: true }).click();
  await confirm(page);
  await expect
    .poll(async () => (await data(page)).works.some((w) => w.name === '测试手作作品已编辑'))
    .toBe(false);
  expect((await data(page)).orders.some((o) => o.id === db.orders[0].id)).toBe(true);
});

test('existing version 1 browser data migrates without losing records', async ({ page }) => {
  const db = await data(page);
  const { counterparties, templates, works, ...old } = db;
  const legacy = {
    ...old,
    version: 1,
    orders: old.orders.map(({ queuePosition, counterpartyId, ...o }) => o),
  };
  await page.evaluate(
    (legacy) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('shijian-studio', 1);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('data', 'readwrite');
          tx.objectStore('data').put(legacy, 'workspace');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    legacy,
  );
  await page.reload();
  await orders(page);
  await expect(page.locator('.queue-card')).toHaveCount(db.orders.length);
  await expect.poll(async () => (await data(page)).version).toBe(3);
  const migrated = await data(page);
  expect(migrated.orders.map((o) => o.id)).toEqual(db.orders.map((o) => o.id));
  expect(migrated.items.map((i) => [i.id, i.attachments, i.price, i.folderId])).toEqual(
    db.items.map((i) => [i.id, i.attachments, i.price, i.folderId]),
  );
  expect(migrated.tasks).toEqual(db.tasks);
  await module(page, '交易对象');
  await expect(page.locator('.counterparty-card')).toHaveCount(3);
});
