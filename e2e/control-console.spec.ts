import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

test('author can create, recover, and advance a new-book bootstrap session', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建作品' }).click();
  await expect(page.getByRole('heading', { name: 'Bootstrap 工作台' })).toBeVisible();
  await expect(page.locator('body')).toContainText('market-research');

  await page.getByLabel('阶段输入').fill('趋势简报：读者偏好快节奏悬疑与有限世界规则。');
  await page.getByRole('button', { name: '保存本轮' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存。');
  await page.getByRole('button', { name: '继续下一阶段' }).click();
  await expect(page.locator('body')).toContainText('inspiration-dialogue');
  await page.getByLabel('阶段输入').fill('第1轮：题材与读者。');
  await page.getByRole('button', { name: '保存本轮' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存。');
  await page.getByLabel('阶段输入').fill('第2轮：核心创意与主角。');
  await page.getByRole('button', { name: '保存本轮' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存。');
  await page.getByLabel('阶段输入').fill('第3轮：冲突与对立。');
  await page.getByRole('button', { name: '保存本轮' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存。');
  await page.getByLabel('阶段输入').fill('第4轮：差异化与边界。');
  await page.getByRole('button', { name: '保存本轮' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存。');
  await page.getByLabel('阶段输入').fill('第5轮：终局偏好与假设。');
  await page.getByRole('button', { name: '保存本轮' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存。');
  const sessionId = page.url().split('/').at(-1);
  if (sessionId !== undefined) {
    let inspirationRevisions = 0;
    for (let retries = 0; retries < 5 && inspirationRevisions < 5; retries += 1) {
      const revisionsResponse = await page.request.get(`/api/bootstrap-sessions/${sessionId}/revisions`);
      const revisions = await revisionsResponse.json() as Array<{ stage: string }>;
      inspirationRevisions = revisions.filter((revision) => revision.stage === 'inspiration-dialogue').length;
      if (inspirationRevisions < 5) {
        await page.getByLabel('阶段输入').fill(`补齐轮次-${retries + 1}`);
        await page.getByRole('button', { name: '保存本轮' }).click();
        await expect(page.getByRole('status')).toHaveText('已保存。');
      }
    }
  }
  await page.getByRole('button', { name: '继续下一阶段' }).click();
  await expect(page.locator('body')).toContainText('project-brief');

  await page.getByRole('link', { name: '返回工作区' }).click();
  await expect(page.getByText('可恢复的初始化会话')).toBeVisible();
  await expect(page.locator('body')).toContainText('project-brief');
  await expect(page.getByRole('button', { name: '继续创建' })).toBeEnabled();
});

test('author can progress an import session through mapping confirmation and health report', async ({ page }) => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'novel-import-e2e-source-'));
  const targetRoot = await mkdtemp(join(tmpdir(), 'novel-import-e2e-target-'));
  await writeFile(join(sourceRoot, 'project-brief.md'), 'brief content', 'utf8');
  await page.goto('/');
  try {
    await page.getByRole('button', { name: '导入作品' }).click();
    await expect(page.locator('body')).toContainText('import-scan');

    await page.getByLabel('导入映射 JSON').fill('{"entries":[{"sourcePath":"project-brief.md","detectedKind":"project-brief","canonicalTarget":"state/book/project-brief.md","confidence":1}]}');
    await page.getByRole('button', { name: '保存映射预览' }).click();
    await expect(page.getByRole('status')).toHaveText('已保存。');
    await expect(page.locator('body')).toContainText('import-mapping');
    await expect(page.getByRole('heading', { name: '确认导入' })).toBeVisible();

    await page.getByLabel('原始目录').fill(sourceRoot);
    await page.getByLabel('Canonical 工作区目录').fill(targetRoot);
    await page.getByLabel('确认导入映射 JSON').fill('{"approved":true,"summary":"confirmed","entries":[{"sourcePath":"project-brief.md","detectedKind":"project-brief","canonicalTarget":"state/book/project-brief.md","confidence":1}]}');
    await page.getByRole('button', { name: '确认导入' }).click();
    await expect(page.locator('body')).toContainText('import-health-report');

    await page.getByRole('button', { name: '继续下一阶段' }).click();
    await expect(page.locator('body')).toContainText('ready-to-write');

    expect(await readFile(join(targetRoot, 'state/book/project-brief.md'), 'utf8')).toBe('brief content');
    const healthReport = JSON.parse(await readFile(join(targetRoot, 'references/imported/health-report.json'), 'utf8')) as { ready: boolean };
    expect(healthReport.ready).toBe(false);
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});
