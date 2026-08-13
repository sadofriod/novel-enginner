/**
 * Bun CLI control surface, per
 * docs/architecture/modules/07-api-events-and-runtime.md §7.1 and
 * docs/architecture/modules/10-v1-execution-plan.md Phase 5.
 *
 * The CLI and HTTP API share the same `CommandEnvelope` validation, so every command
 * issued here is structurally identical to an HTTP POST /commands call. Usage:
 *
 *   bun run src/runtime/cli.ts re-sync-state --workspace-id <id> --book-id <id>
 *   bun run src/runtime/cli.ts propose chapter-outline chapter-0042-outline --workspace-id <id> --book-id <id>
 *   bun run src/runtime/cli.ts regenerate chapter-outline chapter-0042-outline --workspace-id <id> --book-id <id>
 *   bun run src/runtime/cli.ts export-draft chapter-manuscript chapter-0042 --workspace-id <id> --book-id <id>
 *   bun run src/runtime/cli.ts resume-run run-chapter-0042-001 --workspace-id <id> --book-id <id>
 *   bun run src/runtime/cli.ts abort-run run-chapter-0042-001 --workspace-id <id> --book-id <id>
 */

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

  let index = 0;
  const [subcommand, ...rest] = argv;

  for (; index < rest.length; index += 1) {
    const arg = rest[index] as string;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = rest[index + 1];
      if (value !== undefined && !value.startsWith('--')) {
        flags[key] = value;
        index += 1;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return { subcommand: subcommand ?? '', positional, flags };
}

function requiredFlag(flags: Readonly<Record<string, string>>, name: string): string {
  const value = flags[name];
  if (value === undefined || value === '') {
    console.error(`Missing required flag --${name}`);
    process.exit(1);
    throw new Error(`Missing required flag --${name}`); // unreachable; satisfies narrowing
  }
  return value;
}

function idempotencyKey(): string {
  return `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function postCommand(envelope: Omit<CommandEnvelope, 'idempotencyKey'> & { idempotencyKey?: string }): Promise<void> {
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

async function postSync(syncRoute: 'rebuild-graph' | 're-sync-state', body: Record<string, unknown>): Promise<void> {
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
  regenerate <type> <targetId>--workspace-id <id> --book-id <id> [--requested-by <author>]
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
  --workspace-id  Workspace identifier (required for all commands)
  --book-id       Book identifier (required for all commands)
  --requested-by  Author identifier (default: author-local)
  --idempotency-key  Override the auto-generated idempotency key

Environment:
  NOVEL_API_BASE_URL  Base URL for the local API (default: http://localhost:3000)
`);
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs[0] === '--help' || rawArgs[0] === '-h') {
    usage();
    process.exit(0);
  }

  const { subcommand, positional, flags } = parseArgs(rawArgs);
  const workspaceId = requiredFlag(flags, 'workspace-id');
  const bookId = requiredFlag(flags, 'book-id');
  const requestedBy = flags['requested-by'] ?? 'author-local';
  const userIdempotencyKey = flags['idempotency-key'];

  switch (subcommand) {
    case 're-sync-state': {
      await postSync('re-sync-state', { workspaceId, bookId });
      break;
    }

    case 'rebuild-graph': {
      await postSync('rebuild-graph', { workspaceId, bookId });
      break;
    }

    case 'propose':
    case 'regenerate': {
      const artifactType = positional[0];
      const targetId = positional[1];
      if (artifactType === undefined || targetId === undefined) {
        console.error(`Usage: ${subcommand} <artifactType> <targetId> --workspace-id <id> --book-id <id>`);
        process.exit(1);
      }
      await postCommand({
        workspaceId,
        bookId,
        artifactType: artifactType as CommandEnvelope['artifactType'],
        targetId,
        intent: subcommand as 'propose' | 'regenerate',
        requestedBy,
        approvalMode: 'manual',
        ...(userIdempotencyKey !== undefined ? { idempotencyKey: userIdempotencyKey } : {}),
      });
      break;
    }

    case 'approve':
    case 'reject':
    case 'override-approve':
    case 'export-draft': {
      const artifactType = positional[0];
      const targetId = positional[1];
      if (artifactType === undefined || targetId === undefined) {
        console.error(`Usage: ${subcommand} <artifactType> <targetId> --workspace-id <id> --book-id <id>`);
        process.exit(1);
      }
      await postCommand({
        workspaceId,
        bookId,
        artifactType: artifactType as CommandEnvelope['artifactType'],
        targetId,
        intent: subcommand as CommandEnvelope['intent'],
        requestedBy,
        approvalMode: 'manual',
        ...(userIdempotencyKey !== undefined ? { idempotencyKey: userIdempotencyKey } : {}),
      });
      break;
    }

    case 'resume-run':
    case 'abort-run':
    case 'retry-step': {
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
        workspaceId,
        bookId,
        targetId: runId,
        intent: resolvedIntent,
        systemTaskType: subcommand as CommandEnvelope['systemTaskType'],
        requestedBy,
        approvalMode: 'manual',
        ...(userIdempotencyKey !== undefined ? { idempotencyKey: userIdempotencyKey } : {}),
      });
      break;
    }

    default: {
      console.error(`Unknown subcommand: ${subcommand}`);
      usage();
      process.exit(1);
    }
  }
}

main().catch((error: unknown) => {
  console.error('CLI error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
