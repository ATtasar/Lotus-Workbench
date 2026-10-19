import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Database } from '../../src/data/types';

const runtimeErrors = new WeakMap<Page, string[]>();

async function snapshot(page: Page): Promise<Database> {
  return page.evaluate(
    () =>
      new Promise<Database>((resolve, reject) => {
        const r = indexedDB.open('shijian-studio', 1);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction('data').objectStore('data').get('workspace');
          q.onsuccess = () => {
            db.close();
            resolve(q.result);
          };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
}
async function nav(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name, exact: true })
    .click();
  if (name === '订单') await page.getByRole('tab', { name: '订单整理', exact: true }).click();
}
async function save(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function confirm(page: Page) {
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '收纳展示' })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

test('five pages, mobile layout, carousel, and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
  const title = await page.locator('.showcase-caption h3').innerText();
  await page.getByRole('button', { name: '下一件收藏', exact: true }).click();
  await expect(page.locator('.showcase-caption h3')).not.toHaveText(title);
  for (const [tab, heading, file] of [
    ['订单', '订单', 'orders'],
    ['收纳', '收纳', 'storage'],
    ['日历', '日历', 'calendar'],
    ['我的', '设置', 'settings'],
  ]) {
    await nav(page, tab);
    if (tab === '收纳') await expect(page.locator('.storage-tools')).toBeVisible();
    else
      await expect(
        page.getByRole('heading', { name: heading, exact: true, level: 1 }),
      ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/${file}-mobile.png`, fullPage: true });
  }
  await nav(page, '总览');
  await page.getByRole('button', { name: '下一周', exact: true }).click();
  await expect(page.locator('.day-peek')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.locator('.app-shell').evaluate((e) => e.getBoundingClientRect().width)).toBe(
    480,
  );
  expect(errors).toEqual([]);
});

test('order CRUD, payment independent from progress, task dates sync and persist', async ({
  page,
}) => {
  await nav(page, '订单');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByLabel('订单名称 *', { exact: true }).fill('测试 · 春山委托');
  await page.getByLabel('买家 / 卖家 / 委托方', { exact: true }).fill('测试委托人');
  await page.getByLabel('设定金额（元）', { exact: true }).fill('456');
  await page.getByLabel('付款状态', { exact: true }).selectOption('已付全款');
  await save(page);
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '测试 · 春山委托' }) })
    .click();
  await page.getByRole('button', { name: '绘制中', exact: true }).click();
  await page.getByLabel('订单状态', { exact: true }).selectOption('进行中');
  await expect
    .poll(
      async () => (await snapshot(page)).orders.find((o) => o.name === '测试 · 春山委托')?.payment,
    )
    .toBe('已付全款');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await page.getByLabel('任务名称 *', { exact: true }).fill('测试上色节点');
  await page.getByLabel('日期 *', { exact: true }).fill('2026-11-05');
  await page.getByLabel('时间 · 选填', { exact: true }).fill('14:30');
  await page.getByRole('switch', { name: '开启任务提醒' }).click();
  await save(page);
  await page.getByRole('button', { name: '编辑测试上色节点', exact: true }).click();
  await page.getByLabel('日期 *', { exact: true }).fill('2026-11-06');
  await save(page);
  await expect(page.getByText('11月6日', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '完成测试上色节点', exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).tasks.find((t) => t.name === '测试上色节点')?.done)
    .toBe(true);
  await page.reload();
  await nav(page, '订单');
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '测试 · 春山委托' }) })
    .click();
  await expect(page.getByRole('button', { name: '取消完成测试上色节点' })).toBeVisible();
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  await page.getByLabel('订单名称 *', { exact: true }).fill('测试 · 修改后的订单');
  await save(page);
  await page.getByRole('button', { name: '归档订单', exact: true }).click();
  await nav(page, '订单');
  await page.getByRole('button', { name: '已归档', exact: true }).click();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '测试 · 修改后的订单' }) })
    .click();
  await page.getByRole('button', { name: '恢复订单', exact: true }).click();
  await page.getByRole('button', { name: '删除订单', exact: true }).click();
  await confirm(page);
  await expect
    .poll(async () => (await snapshot(page)).orders.some((o) => o.name === '测试 · 修改后的订单'))
    .toBe(false);
  expect((await snapshot(page)).tasks.some((t) => t.name === '测试上色节点')).toBe(false);
});

test('nested folders, independent reviews, valid moves and recursive deletion', async ({
  page,
}) => {
  await nav(page, '收纳');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: /新建文件夹/ }).click();
  await page.getByLabel('名称 *', { exact: true }).fill('测试收藏夹');
  await page.getByRole('button', { name: '评2星', exact: true }).click();
  await page.getByLabel('文字评价', { exact: true }).fill('父级独立评价');
  await save(page);
  await page.getByRole('button', { name: '测试收藏夹', exact: true }).click();
  await page.getByRole('button', { name: '子文件夹', exact: true }).click();
  await page.getByLabel('名称 *', { exact: true }).fill('测试深层');
  await save(page);
  await page.getByRole('button', { name: '测试深层', exact: true }).click();
  await page.getByRole('button', { name: '添加物品', exact: true }).click();
  await page.getByLabel('物品名称 *', { exact: true }).fill('测试收藏物');
  await page.getByRole('button', { name: '评4星', exact: true }).click();
  await page.getByRole('switch', { name: '加入首页展示' }).click();
  await save(page);
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '测试收藏物' }) })
    .click();
  await page.getByRole('button', { name: '移动', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '根目录', exact: true }).click();
  await page.getByRole('button', { name: '移动到这里' }).click();
  await expect
    .poll(async () => (await snapshot(page)).items.find((i) => i.name === '测试收藏物')?.folderId)
    .toBeNull();
  await page.getByRole('button', { name: '复制条目', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '测试收藏物（副本）', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await confirm(page);
  await page.getByRole('button', { name: '测试收藏夹', exact: true }).click();
  await page.getByRole('button', { name: '移动文件夹' }).click();
  await expect(
    page.getByRole('dialog').getByRole('button').filter({ hasText: '测试深层' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const data = await snapshot(page);
  expect(data.folders.find((f) => f.name === '测试收藏夹')?.rating).toBe(2);
  expect(data.folders.find((f) => f.name === '测试深层')?.rating).toBeNull();
  expect(data.items.find((i) => i.name === '测试收藏物')?.rating).toBe(4);
  await page.getByRole('button', { name: '删除文件夹', exact: true }).click();
  await confirm(page);
  await expect
    .poll(async () => (await snapshot(page)).folders.some((f) => f.name === '测试深层'))
    .toBe(false);
  expect((await snapshot(page)).items.some((i) => i.name === '测试收藏物')).toBe(true);
});

test('image uploads persist, galleries preview, and removing a single image works', async ({
  page,
}) => {
  await nav(page, '收纳');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: /添加物品/ }).click();
  await page.getByLabel('物品名称 *', { exact: true }).fill('测试图片物品');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hD8AAAAASUVORK5CYII=',
    'base64',
  );
  await page.getByLabel('上传附件', { exact: true }).setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: png },
    { name: 'second.png', mimeType: 'image/png', buffer: png },
  ]);
  await expect(page.locator('.attachment-thumb')).toHaveCount(2);
  await save(page);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).items.find((i) => i.name === '测试图片物品')?.attachments.length,
    )
    .toBe(2);
  await page.reload();
  await nav(page, '收纳');
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '测试图片物品' }) })
    .click();
  await page.getByRole('button', { name: '查看物品图片' }).click();
  await page.getByRole('button', { name: '预览first.png' }).click();
  await expect(page.getByRole('dialog', { name: '图片预览' })).toBeVisible();
  await page.getByRole('button', { name: '关闭预览' }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: '删除附件first.png' }).click();
  await save(page);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).items.find((i) => i.name === '测试图片物品')?.attachments.length,
    )
    .toBe(1);
});

test('personal task calendar views, reminder edit, complete and delete', async ({ page }) => {
  await nav(page, '日历');
  await page.getByRole('button', { name: '下一月', exact: true }).click();
  await expect(page.locator('.calendar-heading h2')).toContainText('11');
  await page.getByRole('button', { name: '周', exact: true }).click();
  await expect(page.locator('.date-buttons > button')).toHaveCount(7);
  await page.getByRole('button', { name: '日', exact: true }).click();
  await expect(page.locator('.date-buttons > button')).toHaveCount(1);
  await page.getByRole('button', { name: '回到今天' }).click();
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByLabel('任务名称 *', { exact: true }).fill('测试个人日程');
  await page.getByRole('switch', { name: '开启任务提醒' }).click();
  await page.getByLabel('提醒日期与时间 *', { exact: true }).fill('2026-01-01T08:00');
  await save(page);
  await page.getByRole('button', { name: '编辑测试个人日程', exact: true }).click();
  await page.getByLabel('备注', { exact: true }).fill('修改后的日程备注');
  await save(page);
  await page.getByRole('button', { name: /应用内提醒已开启/ }).click();
  await expect(
    page.getByRole('dialog').getByRole('button').filter({ hasText: '测试个人日程' }),
  ).toContainText('已到提醒时间');
  await page.getByRole('dialog').getByRole('button').filter({ hasText: '测试个人日程' }).click();
  await page.getByRole('switch', { name: '开启任务提醒' }).click();
  await save(page);
  await page.getByRole('button', { name: '完成测试个人日程' }).click();
  await expect
    .poll(async () => (await snapshot(page)).tasks.find((t) => t.name === '测试个人日程')?.done)
    .toBe(true);
  await page.getByRole('button', { name: '编辑测试个人日程' }).click();
  await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await confirm(page);
  await expect
    .poll(async () => (await snapshot(page)).tasks.some((t) => t.name === '测试个人日程'))
    .toBe(false);
});

test('order-item linking from both sides, real search and filtering', async ({ page }) => {
  await nav(page, '订单');
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByLabel('订单类型', { exact: true }).selectOption('购买商品');
  await expect(page.locator('.order-card')).toHaveCount(1);
  await page.locator('.order-card').click();
  await page.getByRole('button', { name: '关联物品', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /一枝青 · 小花器/ })
    .click();
  await page.getByRole('button', { name: /保存关联/ }).click();
  await expect.poll(async () => (await snapshot(page)).links.length).toBe(2);
  await page.locator('.linked-row > button').filter({ hasText: '一枝青' }).click();
  await expect(page.getByRole('heading', { name: '一枝青 · 小花器', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消关联', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).links.length).toBe(1);
  await nav(page, '总览');
  await page.getByRole('button', { name: '全局搜索' }).click();
  await page.getByPlaceholder('搜索订单、物品、文件夹、标签…').fill('纸间');
  await expect(page.locator('.search-group')).toHaveCount(4);
  await page.getByRole('button', { name: '清除搜索' }).click();
  await page.getByPlaceholder('搜索订单、物品、文件夹、标签…').fill('完全不存在的物品');
  await expect(page.getByRole('heading', { name: '暂时没有找到' })).toBeVisible();
});

test('profile, backup roundtrip, malformed import, empty state and seed restore', async ({
  page,
}) => {
  await nav(page, '我的');
  await page.getByRole('button', { name: /编辑个人资料/ }).click();
  await page.getByLabel('称呼 *', { exact: true }).fill('测试创作者');
  await page.getByRole('button', { name: '保存资料' }).click();
  await page.getByRole('switch', { name: '紧凑列表' }).click();
  await page.getByLabel('一周的开始', { exact: true }).selectOption('sunday');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整 JSON 备份' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByRole('button', { name: '清空本地记录' }).click();
  await confirm(page);
  await expect.poll(async () => (await snapshot(page)).orders.length).toBe(0);
  await nav(page, '总览');
  await expect(page.getByRole('heading', { name: '暂无首页展示物品' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '暂无首页展示物品' })).toBeVisible();
  await nav(page, '我的');
  await page.getByLabel('导入备份文件').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":1}'),
  });
  await expect(page.getByRole('status')).toContainText('备份格式无效');
  expect((await snapshot(page)).orders.length).toBe(0);
  await page.getByLabel('导入备份文件').setInputFiles(path!);
  await confirm(page);
  await expect.poll(async () => (await snapshot(page)).orders.length).toBe(3);
  await page.reload();
  await nav(page, '我的');
  await expect(page.getByRole('heading', { name: '测试创作者', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复示例数据' }).click();
  await confirm(page);
  await expect.poll(async () => (await snapshot(page)).settings.name).toBe('小拾');
});

test('today opens its events, showcase obeys opt-in and supports a single item', async ({
  page,
}) => {
  await page.locator('.home-calendar .date-buttons .selected').click();
  await expect(page.locator('.day-peek')).toContainText('完成双人插画线稿');
  const initial = await snapshot(page);
  for (const item of initial.items.filter((i) => i.featured)) {
    await nav(page, '总览');
    await page.getByRole('button', { name: '全局搜索' }).click();
    await page.getByPlaceholder('搜索订单、物品、文件夹、标签…').fill(item.name);
    await page.locator('.search-group > button').click();
    await page.getByRole('switch', { name: '加入首页展示' }).click();
  }
  await nav(page, '总览');
  await expect(page.getByRole('heading', { name: '暂无首页展示物品' })).toBeVisible();
  await nav(page, '收纳');
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '朱笺 · 灵感便签' }) })
    .click();
  await page.getByRole('switch', { name: '加入首页展示' }).click();
  await nav(page, '总览');
  await expect(page.locator('.showcase-caption h3')).toHaveText('朱笺 · 灵感便签');
  await expect(page.getByRole('button', { name: '下一件收藏', exact: true })).toBeDisabled();
  await expect(page.locator('.carousel-dots > button')).toHaveCount(1);
});

test('phone HTTP compatibility without crypto.randomUUID', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'Asia/Shanghai',
  });
  await context.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: undefined }),
  );
  const phone = await context.newPage();
  const errors: string[] = [];
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto('http://localhost:5173');
  await expect(phone.getByRole('heading', { name: '收纳展示' })).toBeVisible();
  await nav(phone, '订单');
  await phone.getByRole('button', { name: '新建', exact: true }).click();
  await phone.getByLabel('订单名称 *', { exact: true }).fill('局域网手机记录');
  await save(phone);
  await expect
    .poll(async () => (await snapshot(phone)).orders.some((o) => o.name === '局域网手机记录'))
    .toBe(true);
  const ids = (await snapshot(phone)).orders.map((o) => o.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(errors).toEqual([]);
  await context.close();
});
