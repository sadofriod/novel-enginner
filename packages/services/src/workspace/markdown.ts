import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const FRONTMATTER_DELIMITER = '---';
const SCENE_HEADING_PATTERN = /^#\s+Scene\s+(\S+)\s*$/;
const SECTION_HEADING_PATTERN = /^#\s+(.+?)\s*$/;

export interface ParsedCanonicalMarkdown {
  readonly frontmatter: unknown;
  readonly sections: ReadonlyMap<string, string>;
  readonly scenes: ReadonlyMap<string, string>;
}

export class MarkdownContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarkdownContractError';
  }
}

function splitFrontmatter(raw: string): { readonly frontmatterText: string; readonly body: string } {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    throw new MarkdownContractError('Canonical markdown must start with a frontmatter delimiter (---).');
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER);
  if (closingIndex === -1) {
    throw new MarkdownContractError('Canonical markdown frontmatter is not closed with a delimiter (---).');
  }

  const frontmatterText = lines.slice(1, closingIndex).join('\n');
  const body = lines.slice(closingIndex + 1).join('\n');
  return { frontmatterText, body };
}

function parseFrontmatterYaml(frontmatterText: string): unknown {
  try {
    return parseYaml(frontmatterText) ?? {};
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new MarkdownContractError(`Failed to parse frontmatter YAML: ${message}`);
  }
}

function isSceneHeading(headingTitle: string): string | undefined {
  const match = SCENE_HEADING_PATTERN.exec(`# ${headingTitle}`);
  return match?.[1];
}

interface OpenBlock {
  readonly key: string;
  readonly isScene: boolean;
  readonly lines: string[];
}

function flushBlock(
  block: OpenBlock | undefined,
  sections: Map<string, string>,
  scenes: Map<string, string>,
): void {
  if (block === undefined) {
    return;
  }
  const content = block.lines.join('\n').trim();
  const target = block.isScene ? scenes : sections;
  target.set(block.key, content);
}

function startBlock(title: string): OpenBlock {
  const sceneId = isSceneHeading(title);
  return { key: sceneId ?? title, isScene: sceneId !== undefined, lines: [] };
}

function parseBodySections(body: string): { readonly sections: Map<string, string>; readonly scenes: Map<string, string> } {
  const sections = new Map<string, string>();
  const scenes = new Map<string, string>();
  let currentBlock: OpenBlock | undefined;

  for (const line of body.split('\n')) {
    const headingMatch = SECTION_HEADING_PATTERN.exec(line);
    if (headingMatch) {
      flushBlock(currentBlock, sections, scenes);
      currentBlock = startBlock(headingMatch[1] ?? '');
      continue;
    }
    currentBlock?.lines.push(line);
  }
  flushBlock(currentBlock, sections, scenes);

  return { sections, scenes };
}

export function parseCanonicalMarkdown(raw: string): ParsedCanonicalMarkdown {
  const { frontmatterText, body } = splitFrontmatter(raw);
  const frontmatter = parseFrontmatterYaml(frontmatterText);
  const { sections, scenes } = parseBodySections(body);
  return { frontmatter, sections, scenes };
}

export interface SerializeCanonicalMarkdownInput {
  readonly frontmatter: unknown;
  readonly sections?: ReadonlyMap<string, string> | Record<string, string>;
  readonly scenes?: ReadonlyMap<string, string> | Record<string, string>;
}

function toEntries(value: ReadonlyMap<string, string> | Record<string, string> | undefined): readonly (readonly [string, string])[] {
  if (value === undefined) {
    return [];
  }
  if (value instanceof Map) {
    return [...value.entries()];
  }
  return Object.entries(value);
}

export function serializeCanonicalMarkdown(input: SerializeCanonicalMarkdownInput): string {
  const frontmatterText = stringifyYaml(input.frontmatter, { lineWidth: 0 }).trimEnd();
  const parts: string[] = [FRONTMATTER_DELIMITER, frontmatterText, FRONTMATTER_DELIMITER];

  for (const [title, content] of toEntries(input.sections)) {
    parts.push('', `# ${title}`, '', content);
  }
  for (const [sceneId, content] of toEntries(input.scenes)) {
    parts.push('', `# Scene ${sceneId}`, '', content);
  }

  return `${parts.join('\n')}\n`;
}
