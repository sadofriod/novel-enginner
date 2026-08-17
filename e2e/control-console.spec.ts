import { expect, test } from '@playwright/test';

test('author can open the unified workbench and re-sync the workspace', async ({ page }) => {
  await page.goto('/workspace');

  await expect(page.getByRole('heading', { name: '书目录' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '书目录' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '工作台工具' })).toBeVisible();
  await expect(page.getByText('进入已有工作区')).toBeVisible();

  const syncResponse = page.waitForResponse((response) => response.url().endsWith('/sync/re-sync-state') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '同步工作区' }).click();
  await expect((await syncResponse).status()).toBe(202);
});

test('author can create, recover, and advance a new-book bootstrap session', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建作品' }).click();
  await expect(page.getByRole('heading', { name: '新建作品向导' })).toBeVisible();
  await page.getByRole('button', { name: '开始新建' }).click();
  await expect(page.getByRole('heading', { name: 'Bootstrap 工作台' })).toBeVisible();
  await expect(page.locator('body')).toContainText('market-research');

  await page.getByLabel('阶段输入').fill('目标读者偏好快节奏悬疑与有限世界规则。');
  await page.getByRole('button', { name: '保存本轮' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存。');
  await page.getByRole('button', { name: '继续下一阶段' }).click();
  await expect(page.locator('body')).toContainText('inspiration-dialogue');

  await page.getByRole('link', { name: '返回工作区' }).click();
  await expect(page.getByText('可恢复的初始化会话')).toBeVisible();
  await expect(page.locator('body')).toContainText('inspiration-dialogue');
});

test('author can progress an import session to a mapping review without writing canonical files', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '导入已有作品' }).click();
  await page.getByLabel('已有作品目录').fill('/tmp/example-novel');
  await page.getByRole('button', { name: '开始导入' }).click();
  await expect(page.locator('body')).toContainText('import-scan');

  await page.getByRole('button', { name: '开始扫描' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存。');
  await expect(page.locator('body')).toContainText('import-mapping');
  await expect(page.getByRole('heading', { name: '确认导入' })).toBeVisible();
});
