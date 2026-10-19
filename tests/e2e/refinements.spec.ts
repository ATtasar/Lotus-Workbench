import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Database } from '../../src/data/types';
import { money, addDays } from '../../src/lib/date';
async function data(page: Page): Promise<Database> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
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
      }),
  );
}
async function nav(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function save(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '收纳展示' })).toBeVisible();
  await mkdir('artifacts', { recursive: true });
});
test.afterEach(async ({ page }) => expect(failures.get(page)).toEqual([]));
test('collection displays large, medium and leaf categories with working navigation', async ({
  page,
}) => {
  await nav(page, '收纳');
  await expect(page.getByRole('heading', { name: '收纳', exact: true })).toHaveCount(0);
  const category = page
    .locator('.collection-category')
    .filter({ has: page.getByRole('button', { name: '纸间收藏', exact: true }) });
  await expect(category.locator('.subcategory-title')).toContainText('纸间集');
  await expect(category.locator('.collection-leaf')).toContainText('纸品系列');
  expect(
    await category.locator('h2').evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThan(
    await category.locator('h3').evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  );
  await page.screenshot({ path: 'artifacts/collection-v3.png', fullPage: true });
  await category.getByRole('button', { name: '纸品系列', exact: true }).click();
  await expect(page.locator('.breadcrumbs')).toContainText('纸品系列');
  await expect(page.getByRole('heading', { name: '山色 · 纸品收藏', exact: true })).toBeVisible();
});
test('counterparty overview has independent requirements preferences and avoidances', async ({
  page,
}) => {
  await nav(page, '订单');
  await page.getByRole('tab', { name: '交易对象' }).click();
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await expect(page.getByLabel('对象名称 *', { exact: true })).toHaveCount(0);
  await expect(page.locator('.contact-sections>button')).toHaveCount(5);
  await page.getByRole('button', { name: '基本资料', exact: true }).click();
  await page.getByLabel('对象名称 *', { exact: true }).fill('偏好测试对象');
  await page.getByRole('button', { name: '返回档案' }).click();
  for (const label of ['需求', '偏好', '雷点']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.getByLabel(label, { exact: true }).fill(`${label}测试内容`);
    await page.getByRole('button', { name: '返回档案' }).click();
  }
  await page.screenshot({ path: 'artifacts/counterparty-v3.png' });
  await save(page);
  await expect
    .poll(
      async () =>
        (await data(page)).counterparties.find((p) => p.name === '偏好测试对象')?.avoidances,
    )
    .toBe('雷点测试内容');
  await page.reload();
  await nav(page, '订单');
  await page.getByRole('tab', { name: '交易对象' }).click();
  await page
    .getByRole('button')
    .filter({ has: page.getByText('偏好测试对象', { exact: true }) })
    .click();
  await page.getByRole('button', { name: '偏好', exact: true }).click();
  await expect(page.getByLabel('偏好', { exact: true })).toHaveValue('偏好测试内容');
});
test('custom options template fees colored calendars and linked sold items share one ledger', async ({
  page,
}) => {
  await nav(page, '订单');
  await page.getByRole('tab', { name: '订单模板' }).click();
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByLabel('模板名称 *', { exact: true }).fill('自定义模板');
  await page.getByRole('button', { name: '管理类型', exact: true }).click();
  await page.getByLabel('新增订单类型名称').fill('自定义模型');
  await page
    .locator('.catalog-field')
    .filter({ has: page.getByLabel('模板订单类型', { exact: true }) })
    .getByRole('button', { name: '添加', exact: true })
    .click();
  await expect(page.getByLabel('模板订单类型', { exact: true })).toHaveValue('自定义模型');
  await page.getByRole('button', { name: '管理平台', exact: true }).click();
  await page.getByLabel('新增平台名称').fill('独立平台');
  await page.getByLabel('新平台颜色').fill('#2468ac');
  await page
    .locator('.catalog-field')
    .filter({ has: page.getByLabel('默认平台', { exact: true }) })
    .getByRole('button', { name: '添加', exact: true })
    .click();
  await page.getByLabel('设定金额（元）', { exact: true }).fill('1000');
  await page.getByLabel('平台费用方式', { exact: true }).selectOption('percent');
  await page.getByLabel('平台费用（%）', { exact: true }).fill('10');
  await page.getByLabel('收支归类', { exact: true }).selectOption('income');
  await expect(page.getByLabel('实际金额（扣除平台费）', { exact: true })).toHaveValue(money(900));
  await page.getByLabel('默认工期（天）', { exact: true }).fill('3');
  await save(page);
  await page
    .locator('.template-card')
    .filter({ has: page.getByRole('heading', { name: '自定义模板', exact: true }) })
    .getByRole('button', { name: '使用模板' })
    .click();
  await page.getByLabel('订单名称 *', { exact: true }).fill('平台收费订单');
  await page.getByLabel('开始日期', { exact: true }).fill('');
  await page.getByLabel('付款状态', { exact: true }).selectOption('已付全款');
  await save(page);
  await expect
    .poll(async () => (await data(page)).orders.find((o) => o.name === '平台收费订单')?.startDate)
    .not.toBe('');
  const order = (await data(page)).orders.find((o) => o.name === '平台收费订单')!;
  await nav(page, '日历');
  await page.getByLabel('日历平台筛选').selectOption('独立平台');
  await expect(page.getByTestId('ledger-income')).toHaveText(money(900));
  await expect(
    page.getByRole('button', { name: `${order.name} · 开始 全天 · 订单日程`, exact: true }),
  ).toBeVisible();
  const mark = page
    .locator(`.date-buttons button[aria-label^="${order.startDate}"] .date-platform-marks i`)
    .first();
  expect(await mark.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(36, 104, 172)');
  await page.screenshot({ path: 'artifacts/calendar-v3.png', fullPage: true });
  await nav(page, '收纳');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: /添加物品/ }).click();
  await page.getByLabel('物品名称 *', { exact: true }).fill('售出模型记录');
  await page.getByLabel('交易平台', { exact: true }).selectOption('独立平台');
  await page.getByLabel('交易价格（元）', { exact: true }).fill('1000');
  await page.getByLabel('物品交易类型').selectOption('sale');
  await page.getByRole('switch', { name: '物品加入日历' }).click();
  await page.getByLabel('物品截止日期').fill(order.dueDate);
  await save(page);
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: '售出模型记录', exact: true }) })
    .click();
  await page.getByRole('button', { name: '关联订单', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '平台收费订单', exact: true }).click();
  await page.getByRole('button', { name: /保存关联/ }).click();
  await nav(page, '日历');
  await page.getByLabel('日历平台筛选').selectOption('独立平台');
  await expect(page.getByTestId('ledger-income')).toHaveText(money(900));
  await page
    .getByRole('button', { name: '售出模型记录 · 开始 全天 · 买卖记录', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '售出模型记录', exact: true })).toBeVisible();
  await nav(page, '日历');
  await page.getByRole('button', { name: '设置平台颜色' }).click();
  await page.getByLabel('平台独立平台颜色').fill('#aa3355');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  expect(
    await page
      .locator(`.date-buttons button[aria-label^="${order.startDate}"] .date-platform-marks i`)
      .filter({ visible: true })
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBeTruthy();
  await expect
    .poll(async () => (await data(page)).platforms.find((p) => p.name === '独立平台')?.color)
    .toBe('#aa3355');
  await page.reload();
  await nav(page, '日历');
  await page.getByLabel('日历平台筛选').selectOption('独立平台');
  expect(
    await page
      .locator(`.date-buttons button[aria-label^="${order.startDate}"] .date-platform-marks i`)
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgb(170, 51, 85)');
  await page.getByRole('button', { name: '设置平台颜色' }).click();
  await page.getByRole('button', { name: '删除订单类型自定义模型', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
  await expect
    .poll(async () => (await data(page)).orderTypes.some((t) => t.name === '自定义模型'))
    .toBe(false);
  expect((await data(page)).orders.find((o) => o.id === order.id)?.type).toBe('自定义模型');
  await page.getByRole('button', { name: '删除平台独立平台', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
  await expect
    .poll(async () => (await data(page)).platforms.some((p) => p.name === '独立平台'))
    .toBe(false);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByLabel('日历平台筛选').selectOption('独立平台');
  expect(
    await page
      .locator(`.date-buttons button[aria-label^="${order.startDate}"] .date-platform-marks i`)
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgb(170, 51, 85)');
});
