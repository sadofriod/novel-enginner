import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { stringify } from 'yaml';

import { reSyncState, type WorkspaceFileInput } from '../packages/services/src/workspace/sync-engine';

const DEFAULT_SOURCE_ROOT = '/Users/dushihua/dev/story-wirter/output/回溯者';
const DEFAULT_TEMPLATE_ROOT = '/Users/dushihua/dev/apps/novel-enginner';

type CanonicalFile = {
  readonly path: string;
  readonly content: string;
};

async function listMarkdownFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [absolutePath] : [];
  }));
  return files.flat();
}

function canonicalMarkdown(frontmatter: Record<string, unknown>, sections: Readonly<Record<string, string>>): string {
  const body = Object.entries(sections)
    .map(([title, content]) => `# ${title}\n\n${content.trim()}`)
    .join('\n\n');
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n${body}\n`;
}

function stableSlug(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function headingOrFallback(content: string, fallback: string): string {
  const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
  return heading === undefined || heading === '' ? fallback : heading.replace(/^第\d+章[：:]\s*/, '');
}

function chapterNumber(path: string): number {
  const matched = /第(\d+)章/.exec(path)?.[1];
  if (matched === undefined) {
    throw new Error(`Cannot read chapter number from ${path}`);
  }
  return Number.parseInt(matched, 10);
}

function chapterId(number: number): string {
  return `chapter-${number.toString().padStart(4, '0')}`;
}

async function sourceMarkdown(sourceRoot: string, relativePath: string): Promise<string> {
  return readFile(join(sourceRoot, relativePath), 'utf8');
}

// eslint-disable-next-line complexity, max-lines-per-function
async function createCanonicalFiles(sourceRoot: string): Promise<readonly CanonicalFile[]> {
  const files: CanonicalFile[] = [];
  const volumes = await Promise.all([1, 2, 3].map(async (number) => sourceMarkdown(sourceRoot, `大纲/volume${number}_stories.md`)));
  const settings = await listMarkdownFiles(join(sourceRoot, '设定'));
  const characters = (await listMarkdownFiles(join(sourceRoot, '角色档案')))
    .filter((path) => basename(path) !== 'README.md')
    .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  const manuscripts = (await listMarkdownFiles(join(sourceRoot, '正文')))
    .filter((path) => basename(path) === '正文.md')
    .sort((left, right) => {
      const storyOrder = left.includes('/故事一/') ? 0 : 1;
      const otherStoryOrder = right.includes('/故事一/') ? 0 : 1;
      return storyOrder - otherStoryOrder || chapterNumber(left) - chapterNumber(right);
    });
  const contexts = new Map((await listMarkdownFiles(join(sourceRoot, '正文')))
    .filter((path) => basename(path) === 'context.md')
    .map((path) => [path.replace(/正文\.md$/, 'context.md'), path]));

  files.push({
    path: 'state/book/book.md',
    content: canonicalMarkdown({
      id: 'book-huisuzhe', title: '回溯者', status: 'active', activeVolumeId: 'volume-001', latestCanonicalVersion: 'snap-0001', globalPromises: [], globalConstraints: [], defaultChapterTypePolicy: { maxConsecutiveSamePrimaryType: 2 },
    }, { Book: '从个人记忆修复案件切入，逐步揭示中央 AI 对历史与认知的系统性篡改。' }),
  });
  files.push({
    path: 'state/book/project-brief.md',
    content: canonicalMarkdown({
      id: 'project-brief-huisuzhe', bookId: 'book-huisuzhe', title: '回溯者', genres: ['近未来科幻', '悬疑'], targetAudience: '偏好高概念科幻与悬疑的成年读者', marketScope: '中文长篇网络小说', readerPromise: '在记忆可被交易和篡改的城市中追索真相。', corePremise: '灰色记忆修复师凯在一次高价委托中发现被系统删除的历史。', openingHook: '林薇的完美记忆中出现了一张不该存在的脸。', contentBoundaries: [], format: '多卷长篇小说', sourceResearchEvidenceIds: [], assumptionIds: [], status: 'approved',
    }, { 'Imported Source': volumes.join('\n\n') }),
  });
  files.push({
    path: 'state/world/world-foundation.md',
    content: canonicalMarkdown({
      id: 'world-foundation-huisuzhe', bookId: 'book-huisuzhe', eraAndPrimarySetting: '中央 AI 上线后第 36 年的共鸣都会', realityMode: '近未来科幻', tone: '冷峻、悬疑、压迫', capabilitySystem: '回溯共鸣与生物电极', immutableRules: ['高强度回溯会造成明确的生理和精神代价。', '中央 AI 会过滤超出稳定阈值的异常记忆。'], socialOrder: '上传者、整合者与幽灵代码构成分层社会。', narrativeProhibitions: [], terminologyRefs: [], projectBriefRef: 'project-brief-huisuzhe', status: 'approved',
    }, { 'Imported Settings': (await Promise.all(settings.map(async (path) => `## ${basename(path, '.md')}\n\n${await readFile(path, 'utf8')}`))).join('\n\n') }),
  });
  files.push({
    path: 'state/book/story-blueprint.md',
    content: canonicalMarkdown({
      id: 'story-blueprint-huisuzhe', bookId: 'book-huisuzhe', projectBriefRef: 'project-brief-huisuzhe', worldFoundationRef: 'world-foundation-huisuzhe', protagonistArc: '凯从自我保护的灰色修复师成长为承载真相的历史记录者。', centralConflict: '被系统篡改的历史与人的真实记忆之间的冲突。', opposition: '中央 AI、星轨财团与其执行体系。', resolutionDirection: '凯进入反抗网络，追索并挑战中央 AI 的控制。', volumePlan: ['第一卷：残影与共鸣', '第二卷：记忆贩子的陷阱', '第三卷：待源大纲展开'], crossVolumeCommitments: ['普罗米修斯的存在与中央 AI 后门会持续推进。'], estimatedVolumeCount: 3, status: 'approved',
    }, { 'Imported Volume Plans': volumes.join('\n\n') }),
  });

  for (const [index, content] of volumes.entries()) {
    const number = index + 1;
    const volumeId = `volume-${number.toString().padStart(3, '0')}`;
    const chapterRoster = number === 1 ? manuscripts.map((_, manuscriptIndex) => `${chapterId(manuscriptIndex + 1)}-outline`) : [];
    files.push({
      path: `state/volumes/${volumeId}.md`,
      content: canonicalMarkdown({ id: volumeId, title: headingOrFallback(content, `第 ${number} 卷`), status: number === 1 ? 'active' : 'planning', sequenceNumber: number, goal: `推进《回溯者》第 ${number} 卷主线。`, stage: number === 1 ? 'drafting' : 'planning', chapterRoster, targetChapterCount: chapterRoster.length || 1, requiredCluePayoffs: [], milestones: [] }, { 'Imported Outline': content }),
    });
  }

  for (const path of characters) {
    const content = await readFile(path, 'utf8');
    const suffix = basename(path, '.md').split('_')[1] ?? basename(path, '.md');
    const id = `char-${stableSlug(suffix)}`;
    files.push({
      path: `state/characters/${id}.md`,
      content: canonicalMarkdown({ id, name: headingOrFallback(content, suffix).split('（')[0]?.trim() ?? suffix, status: 'active', coreMotivation: '遵循角色档案中定义的目标、职责与关系。', worldview: '详见导入角色档案。', baselinePersonality: '详见导入角色档案。', hardConstraints: [], knowledgeLedger: [], relationshipIds: [], resourceIds: [], techLevel: '详见导入角色档案。' }, { 'Imported Character Profile': content }),
    });
  }

  for (const path of settings) {
    const content = await readFile(path, 'utf8');
    const id = `fact-${stableSlug(basename(path, '.md'))}`;
    files.push({
      path: `state/facts/${id}.md`,
      content: canonicalMarkdown({ id, statement: `《回溯者》设定：${headingOrFallback(content, basename(path, '.md'))}`, sourceRef: 'import-huisuzhe', visibility: 'author-only', status: 'active' }, { 'Imported Setting': content }),
    });
  }

  for (const [manuscriptIndex, manuscriptPath] of manuscripts.entries()) {
    const content = await readFile(manuscriptPath, 'utf8');
    const sourceContextPath = manuscriptPath.replace(/正文\.md$/, 'context.md');
    const contextPath = contexts.get(sourceContextPath);
    const context = contextPath === undefined ? '' : await readFile(contextPath, 'utf8');
    const number = manuscriptIndex + 1;
    const id = chapterId(number);
    const outlineId = `${id}-outline`;
    const title = headingOrFallback(content, `第 ${number} 章`);
    const sourcePath = relative(sourceRoot, manuscriptPath);
    files.push({
      path: `state/chapters/${outlineId}.md`,
      content: canonicalMarkdown({
        id: outlineId, chapterNumber: number, volumeId: 'volume-001', chapterType: 'progress', chapterTypeTags: ['progress'], status: 'approved', displayTitle: title, targetWordCount: Math.max(content.length, 1), activeClueIds: [], resolveClueIds: [], introduceClueIds: [], sceneSkeleton: [{ id: `scene-${id}-source`, purpose: `导入自 ${sourcePath} 的章节叙事。`, locationId: 'location-resonance-metropolis', participantCharacterIds: ['char-kai'] }], emotionCurveStageIds: [`${id}-rise`, `${id}-pressure`, `${id}-reveal`, `${id}-hook`], emotionCurve: [
          { id: `${id}-rise`, stageType: 'rise', emotionIntensity: 2, targetReaderEffects: ['anticipation'], sceneIds: [`scene-${id}-source`], summary: '建立本章情境。' },
          { id: `${id}-pressure`, stageType: 'pressure', emotionIntensity: 3, targetReaderEffects: ['pressure'], sceneIds: [`scene-${id}-source`], summary: '推进章节冲突。' },
          { id: `${id}-reveal`, stageType: 'reveal-or-turn', emotionIntensity: 4, targetReaderEffects: ['shock'], sceneIds: [`scene-${id}-source`], summary: '呈现信息或关系变化。' },
          { id: `${id}-hook`, stageType: 'hook', emotionIntensity: 4, targetReaderEffects: ['anticipation'], sceneIds: [`scene-${id}-source`], summary: '保留下一章推进动力。' },
        ],
      }, { 'Imported Chapter Context': context === '' ? '源目录未提供独立 context.md。' : context }),
    });
    files.push({
      path: `manuscript/volume-001/${id}.md`,
      content: canonicalMarkdown({ id, chapterNumber: number, volumeId: 'volume-001', basedOnOutlineId: outlineId, status: 'approved', displayTitle: title, basedOnCanonicalVersion: 'snap-0001', sceneAnchorIds: [`scene-${id}-source`] }, { [`Scene scene-${id}-source`]: content }),
    });
  }

  files.push({
    path: 'state/locations/location-resonance-metropolis.md',
    content: canonicalMarkdown({ id: 'location-resonance-metropolis', name: '共鸣都会', type: '城市', hazards: ['中央 AI 的持续监管', '异常记忆的清洗'], accessRules: ['不同阶层具有不同数字身份与区域权限。'], status: 'active' }, { 'Imported Source': '《回溯者》的主要行动空间。详细地理设定保存在世界基础与导入设定事实中。' }),
  });
  files.push({
    path: 'state/reviewer/rules.json', content: await readFile(join(DEFAULT_TEMPLATE_ROOT, 'state/reviewer/rules.json'), 'utf8') });
  files.push({
    path: 'state/capabilities/registry.md', content: await readFile(join(DEFAULT_TEMPLATE_ROOT, 'state/capabilities/registry.md'), 'utf8') });
  return files;
}

async function writeCanonicalWorkspace(targetRoot: string, files: readonly CanonicalFile[]): Promise<void> {
  for (const file of files) {
    const targetPath = join(targetRoot, file.path);
    await mkdir(join(targetPath, '..'), { recursive: true });
    await writeFile(targetPath, file.content, 'utf8');
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return false;
    }
    throw cause;
  }
}

async function main(): Promise<void> {
  const sourceRoot = process.argv[2] ?? DEFAULT_SOURCE_ROOT;
  const targetRoot = process.argv[3] ?? sourceRoot;
  const protectedPaths = ['state', 'manuscript', 'mcp.json'];
  const existing = await Promise.all(protectedPaths.map(async (path) => await pathExists(join(targetRoot, path)) ? path : undefined));
  const conflicts = existing.filter((path): path is string => path !== undefined);
  if (conflicts.length > 0) {
    throw new Error(`Refusing to overwrite existing canonical workspace paths: ${conflicts.join(', ')}`);
  }
  const files = await createCanonicalFiles(sourceRoot);
  const validation = reSyncState(files as readonly WorkspaceFileInput[]);
  if (validation.errors.length > 0) {
    throw new Error(`Migration generated invalid canonical files:\n${validation.errors.map((error) => `${error.path}: ${error.reason}`).join('\n')}`);
  }
  await writeCanonicalWorkspace(targetRoot, files);
  await cp(join(DEFAULT_TEMPLATE_ROOT, 'mcp.json'), join(targetRoot, 'mcp.json'));
  console.log(`Migrated ${files.length} canonical files to ${targetRoot}.`);
}

void main();