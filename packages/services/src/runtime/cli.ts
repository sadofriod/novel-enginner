/* eslint-disable complexity */

import type { CommandEnvelope } from '../domain';

const BASE_URL = process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000';

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
    console.error(`Missing required flag --${name}`);
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

  const response = await fetch(`${BASE_URL}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (response.status >= 400) {
    console.error('Command rejected:', JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(json, null, 2));
}

async function postSync(
  syncRoute: 'rebuild-graph' | 're-sync-state',
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/sync/${syncRoute}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (response.status >= 400) {
    console.error('Sync command rejected:', JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(json, null, 2));
}

function usage(): void {
  console.log(`
Usage: bun run src/runtime/cli.ts <subcommand> [args] [flags]

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
  return rawArgs.length === 0 || rawArgs[0] === '--help' || rawArgs[0] === '-h';
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
    console.error(`Usage: ${subcommand} <artifactType> <targetId> --workspace-id <id> --book-id <id>`);
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
    console.error(`Usage: ${subcommand} <runId> --workspace-id <id> --book-id <id>`);
    process.exit(1);
  }

  const intentMap: Readonly<Record<string, CommandEnvelope['intent']>> = {
    'resume-run': 'resume-run',
    'abort-run': 'abort-run',
    'retry-step': 'retry-step',
  };
  const resolvedIntent = intentMap[subcommand];
  if (resolvedIntent === undefined) {
    console.error(`Unknown subcommand: ${subcommand}`);
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

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  if (shouldShowUsage(rawArgs)) {
    usage();
    process.exit(0);
  }

  const { subcommand, positional, flags } = parseArgs(rawArgs);
  const cliVars = requireWorkspaceInputs(flags);

  const dispatchers: Readonly<Record<string, () => Promise<void>>> = {
    're-sync-state': async () => {
      await postSync('re-sync-state', { workspaceId: cliVars.workspaceId, bookId: cliVars.bookId });
    },
    'rebuild-graph': async () => {
      await postSync('rebuild-graph', { workspaceId: cliVars.workspaceId, bookId: cliVars.bookId });
    },
    propose: async () => {
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    regenerate: async () => {
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    approve: async () => {
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    reject: async () => {
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    'override-approve': async () => {
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    'export-draft': async () => {
      await executeArtifactCommand(subcommand, positional, cliVars);
    },
    'resume-run': async () => {
      await executeRunCommand(subcommand, positional, cliVars);
    },
    'abort-run': async () => {
      await executeRunCommand(subcommand, positional, cliVars);
    },
    'retry-step': async () => {
      await executeRunCommand(subcommand, positional, cliVars);
    },
  };

  const dispatcher = dispatchers[subcommand];
  if (dispatcher === undefined) {
    console.error(`Unknown subcommand: ${subcommand}`);
    usage();
    process.exit(1);
  }

  await dispatcher();
}

void main().catch((error: unknown) => {
  console.error('CLI error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
