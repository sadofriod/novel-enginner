/* eslint-disable complexity */

import type { CommandEnvelope } from '../domain';
import { createChildLogger } from '../common/logger';
import { runInteractiveCli } from './interactive-cli';

const logger = createChildLogger('cli');

const BASE_URL = process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000';
const LEGACY_CLI_ENABLED = process.env['NOVEL_ALLOW_LEGACY_CLI'] === '1';
const LEGACY_CLI_DISABLED_MESSAGE = [
  'Legacy CLI interaction has been removed.',
  'All user-facing actions must be performed in the Web control console at http://localhost:3001/app.',
  'Local filesystem access remains available through the runtime; command-line interaction is intentionally disabled.',
].join('\n');

interface CliArgs {
  readonly subcommand: string;
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string>>;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const [subcommand, ...rest] = argv;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] as string;

    if (token.startsWith('--')) {
      const nextValue = rest[index + 1];
      const value = nextValue !== undefined && !nextValue.startsWith('--') ? nextValue : 'true';
      flags[token.slice(2)] = value;
      if (value !== 'true' && nextValue !== undefined) {
        index += 1;
      }
      continue;
    }

    positional.push(token);
  }

  return { subcommand: subcommand ?? '', positional, flags };
}

function requiredFlag(flags: Readonly<Record<string, string>>, name: string): string {
  const value = flags[name];
  if (value === undefined || value === '') {
    logger.error({ flagName: name }, 'Missing required flag');
    process.exit(1);
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function idempotencyKey(): string {
  return `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function postCommand(
  envelope: Omit<CommandEnvelope, 'idempotencyKey'> & { readonly idempotencyKey?: string },
): Promise<void> {
  const body: CommandEnvelope = {
    ...envelope,
    idempotencyKey: envelope.idempotencyKey ?? idempotencyKey(),
  } as CommandEnvelope;

  logger.debug(
    { intent: body.intent, artifactType: body.artifactType, targetId: body.targetId },
    'Posting command',
  );

  const response = await fetch(`${BASE_URL}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (response.status >= 400) {
    logger.error(
      { status: response.status, intent: body.intent, response: json },
      'Command rejected by server',
    );
    process.exit(1);
  }

  logger.info({ intent: body.intent }, 'Command executed successfully');
  console.log(JSON.stringify(json, null, 2));
}

async function postSync(
  syncRoute: 'rebuild-graph' | 're-sync-state',
  body: Record<string, unknown>,
): Promise<void> {
  logger.debug({ syncRoute }, 'Posting sync command');

  const response = await fetch(`${BASE_URL}/sync/${syncRoute}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (response.status >= 400) {
    logger.error(
      { status: response.status, syncRoute, response: json },
      'Sync command rejected by server',
    );
    process.exit(1);
  }

  logger.info({ syncRoute }, 'Sync command executed successfully');
  console.log(JSON.stringify(json, null, 2));
}

function usage(): void {
  console.log(`
Usage: bun run src/runtime/cli.ts [subcommand] [args] [flags]

Without a subcommand, starts the interactive selector:
  Up/Down      Move cursor
  Space        Select or deselect
  Enter        Confirm
  Backspace    Return

Subcommands:
  re-sync-state               --workspace-id <id> --book-id <id>
  rebuild-graph               --workspace-id <id> --book-id <id>
  propose <type> <targetId>   --workspace-id <id> --book-id <id> [--requested-by <author>]
  regenerate <type> <targetId> --workspace-id <id> --book-id <id> [--requested-by <author>]
  approve <type> <targetId>   --workspace-id <id> --book-id <id> [--requested-by <author>]
  reject <type> <targetId>    --workspace-id <id> --book-id <id> [--requested-by <author>]
  override-approve <type> <targetId>
                              --workspace-id <id> --book-id <id> [--requested-by <author>]
  export-draft <type> <targetId>
                              --workspace-id <id> --book-id <id> [--requested-by <author>]
  resume-run <runId>          --workspace-id <id> --book-id <id>
  abort-run <runId>           --workspace-id <id> --book-id <id>
  retry-step <runId>          --workspace-id <id> --book-id <id>

Flags:
  --workspace-id      Workspace identifier (required for all commands)
  --book-id           Book identifier (required for all commands)
  --requested-by      Author identifier (default: author-local)
  --idempotency-key   Override the auto-generated idempotency key

Environment:
  NOVEL_API_BASE_URL  Base URL for the local API (default: http://localhost:3000)
`);
}

function shouldShowUsage(rawArgs: readonly string[]): boolean {
  return rawArgs[0] === '--help' || rawArgs[0] === '-h';
}

function requireWorkspaceInputs(
  flags: Readonly<Record<string, string>>,
): {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly requestedBy: string;
  readonly userIdempotencyKey: string | undefined;
} {
  const workspaceId = requiredFlag(flags, 'workspace-id');
  const bookId = requiredFlag(flags, 'book-id');
  const requestedBy = flags['requested-by'] ?? 'author-local';

  return {
    workspaceId,
    bookId,
    requestedBy,
    userIdempotencyKey: flags['idempotency-key'],
  };
}

function interactiveFlags(): Record<string, string> {
  const flags: Record<string, string> = {};
  const workspaceId = process.env['NOVEL_WORKSPACE_ID'];
  const bookId = process.env['NOVEL_BOOK_ID'];
  const requestedBy = process.env['NOVEL_REQUESTED_BY'];
  if (workspaceId !== undefined) flags['workspace-id'] = workspaceId;
  if (bookId !== undefined) flags['book-id'] = bookId;
  if (requestedBy !== undefined) flags['requested-by'] = requestedBy;
  return flags;
}

async function executeArtifactCommand(
  subcommand: string,
  positional: readonly string[],
  variables: {
    readonly workspaceId: string;
    readonly bookId: string;
    readonly requestedBy: string;
    readonly userIdempotencyKey: string | undefined;
  },
): Promise<void> {
  const artifactType = positional[0];
  const targetId = positional[1];

  if (artifactType === undefined || targetId === undefined) {
    logger.error({ subcommand, positionalCount: positional.length }, 'Missing required positional arguments');
    process.exit(1);
  }

  await postCommand({
    workspaceId: variables.workspaceId,
    bookId: variables.bookId,
    artifactType: artifactType as CommandEnvelope['artifactType'],
    targetId,
    intent: subcommand as CommandEnvelope['intent'],
    requestedBy: variables.requestedBy,
    approvalMode: 'manual',
    ...(variables.userIdempotencyKey !== undefined ? { idempotencyKey: variables.userIdempotencyKey } : {}),
  });
}

async function executeRunCommand(
  subcommand: string,
  positional: readonly string[],
  variables: {
    readonly workspaceId: string;
    readonly bookId: string;
    readonly requestedBy: string;
    readonly userIdempotencyKey: string | undefined;
  },
): Promise<void> {
  const runId = positional[0];
  if (runId === undefined) {
    logger.error({ subcommand }, 'Missing required run ID argument');
    process.exit(1);
  }

  const intentMap: Readonly<Record<string, CommandEnvelope['intent']>> = {
    'resume-run': 'resume-run',
    'abort-run': 'abort-run',
    'retry-step': 'retry-step',
  };
  const resolvedIntent = intentMap[subcommand];
  if (resolvedIntent === undefined) {
    logger.error({ subcommand }, 'Unknown subcommand');
    process.exit(1);
  }

  await postCommand({
    workspaceId: variables.workspaceId,
    bookId: variables.bookId,
    targetId: runId,
    intent: resolvedIntent,
    requestedBy: variables.requestedBy,
    approvalMode: 'manual',
    ...(variables.userIdempotencyKey !== undefined ? { idempotencyKey: variables.userIdempotencyKey } : {}),
  });
}

async function executeInteractiveSelection(selection: NonNullable<Awaited<ReturnType<typeof runInteractiveCli>>>): Promise<void> {
  const cliVars = requireWorkspaceInputs(interactiveFlags());

  if (selection.syncState) {
    await postSync('re-sync-state', {
      workspaceId: cliVars.workspaceId,
      bookId: cliVars.bookId,
      requestedBy: cliVars.requestedBy,
      approvalMode: 'manual',
      idempotencyKey: cliVars.userIdempotencyKey ?? idempotencyKey(),
    });
  }

  for (const chapterNumber of selection.chapterNumbers) {
    const chapterId = `chapter-${chapterNumber.toString().padStart(4, '0')}`;
    await executeArtifactCommand('propose', ['chapter-outline', `${chapterId}-outline`], cliVars);
    await executeArtifactCommand('approve', ['chapter-outline', `${chapterId}-outline`], cliVars);
    await executeArtifactCommand('propose', ['chapter-manuscript', chapterId], cliVars);
    await executeArtifactCommand('approve', ['chapter-manuscript', chapterId], cliVars);
    await executeArtifactCommand('export-draft', ['chapter-manuscript', chapterId], cliVars);
  }

  if (selection.rebuildGraph) {
    await postSync('rebuild-graph', {
      workspaceId: cliVars.workspaceId,
      bookId: cliVars.bookId,
      requestedBy: cliVars.requestedBy,
      approvalMode: 'manual',
      idempotencyKey: cliVars.userIdempotencyKey ?? idempotencyKey(),
    });
  }
}

async function runCommand(rawArgs: readonly string[]): Promise<void> {
  if (shouldShowUsage(rawArgs)) {
    logger.debug('Showing usage help');
    usage();
    process.exit(0);
  }

  const { subcommand, positional, flags } = parseArgs(rawArgs);
  logger.debug({ subcommand, positionalCount: positional.length, flagCount: Object.keys(flags).length }, 'Parsed CLI arguments');

  const cliVars = requireWorkspaceInputs(flags);
  logger.debug({ workspaceId: cliVars.workspaceId, bookId: cliVars.bookId }, 'Resolved workspace inputs');

  const dispatchers: Readonly<Record<string, () => Promise<void>>> = {
    're-sync-state': async () => {
      logger.info('Executing re-sync-state command');
      await postSync('re-sync-state', {
        workspaceId: cliVars.workspaceId,
        bookId: cliVars.bookId,
        requestedBy: cliVars.requestedBy,
        approvalMode: 'manual',
        idempotencyKey: cliVars.userIdempotencyKey ?? idempotencyKey(),
      });
    },
    'rebuild-graph': async () => {
      logger.info('Executing rebuild-graph command');
      await postSync('rebuild-graph', {
        workspaceId: cliVars.workspaceId,
        bookId: cliVars.bookId,
        requestedBy: cliVars.requestedBy,
        approvalMode: 'manual',
        idempotencyKey: cliVars.userIdempotencyKey ?? idempotencyKey(),
      });
    },
    propose: async () => {
      logger.info('Executing propose command');
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    regenerate: async () => {
      logger.info('Executing regenerate command');
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    approve: async () => {
      logger.info('Executing approve command');
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    reject: async () => {
      logger.info('Executing reject command');
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    'override-approve': async () => {
      logger.info('Executing override-approve command');
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    'export-draft': async () => {
      logger.info('Executing export-draft command');
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    'resume-run': async () => {
      logger.info('Executing resume-run command');
      await executeRunCommand(subcommand, positional, cliVars);
    },
    'abort-run': async () => {
      logger.info('Executing abort-run command');
      await executeRunCommand(subcommand, positional, cliVars);
    },
    'retry-step': async () => {
      logger.info('Executing retry-step command');
      await executeRunCommand(subcommand, positional, cliVars);
    },
  };

  const dispatcher = dispatchers[subcommand];
  if (dispatcher === undefined) {
    logger.error({ subcommand }, 'Unknown subcommand');
    usage();
    process.exit(1);
  }

  await dispatcher();
}

async function main(): Promise<void> {
  if (!LEGACY_CLI_ENABLED) {
    logger.error('Legacy CLI is disabled');
    console.error(LEGACY_CLI_DISABLED_MESSAGE);
    process.exit(1);
  }

  logger.debug('Starting CLI');
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) {
    logger.debug('No arguments provided, starting interactive CLI');
    const selection = await runInteractiveCli();
    if (selection === undefined) {
      logger.info('Interactive CLI cancelled by user');
      return;
    }
    logger.info('Processing interactive selection');
    await executeInteractiveSelection(selection);
    return;
  }

  await runCommand(rawArgs);
}

void main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.fatal(
    { error: errorMessage, stack: error instanceof Error ? error.stack : undefined },
    'CLI encountered a fatal error',
  );
  process.exit(1);
});
