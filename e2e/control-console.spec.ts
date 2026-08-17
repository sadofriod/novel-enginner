import { expect, test } from '@playwright/test';

test('author can review and approve an artifact from the web console', async ({ page }) => {
  const sseRequest = page.waitForRequest((request) => request.url().endsWith('/runs/run-seed-001/stream'));
  await page.goto('/app');
  await sseRequest;

  await expect(page.getByRole('heading', { name: 'Web 控制台' })).toBeVisible();
  await expect(page.getByText('Proposal 差异视图')).toBeVisible();
  await expect(page.getByText('关联状态变更（原子提交）')).toBeVisible();
  await expect(page.getByText('Reviewer 结果')).toBeVisible();
  await expect(page.getByText('剧情图谱 / 派生状态')).toBeVisible();

  const syncResponse = page.waitForResponse((response) => response.url().endsWith('/sync/re-sync-state') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '同步工作区' }).click();
  await expect((await syncResponse).status()).toBe(202);
  await expect(page.getByRole('heading', { name: '命令回执' })).toBeVisible();

  await page.getByLabel(/短文本微修/).fill('修正一个短标题');
  const commandResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'approve', exact: true }).click();
  await expect((await commandResponse).status()).toBe(202);
  await expect(page.locator('body')).toContainText('修正一个短标题');
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
