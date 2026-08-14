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

  await page.getByLabel(/短文本微修/).fill('修正一个短标题');
  await page.getByRole('button', { name: 'approve', exact: true }).click();

  await page.waitForURL(/artifactType=chapter-outline&targetId=chapter-0042-outline/);
  await expect(page.locator('body')).toContainText('approved');
  await expect(page.locator('body')).toContainText('review-stale');
  await expect(page.locator('body')).toContainText('修正一个短标题');
});
