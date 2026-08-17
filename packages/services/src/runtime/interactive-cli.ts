/* eslint-disable complexity */

import { emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';
import { createChildLogger } from '../common/logger';

const logger = createChildLogger('interactive-cli');

export type InteractiveSelection = {
  readonly syncState: boolean;
  readonly chapterNumbers: readonly number[];
  readonly rebuildGraph: boolean;
};

type InteractiveOption = {
  readonly label: string;
  readonly selected: boolean;
};

const OPTION_LABELS = [
  'Sync canonical state',
  'Generate chapter 1 (outline + manuscript)',
  'Generate chapter 2 (outline + manuscript)',
  'Generate chapter 3 (outline + manuscript)',
  'Rebuild graph',
] as const;

export function moveCursor(cursor: number, direction: 'up' | 'down', optionCount: number): number {
  if (direction === 'up') return cursor === 0 ? optionCount - 1 : cursor - 1;
  return cursor === optionCount - 1 ? 0 : cursor + 1;
}

export function toggleOption(selected: readonly boolean[], cursor: number): readonly boolean[] {
  return selected.map((value, index) => (index === cursor ? !value : value));
}

function renderMenu(options: readonly InteractiveOption[], cursor: number): void {
  process.stdout.write('\u001b[2J\u001b[H');
  console.log('Novel Enginner interactive CLI');
  console.log('Use Up/Down to move, Space to select, Enter to confirm, Backspace to return.\n');

  options.forEach((option, index) => {
    const pointer = index === cursor ? '>' : ' ';
    const checkbox = option.selected ? '[x]' : '[ ]';
    console.log(`${pointer} ${checkbox} ${option.label}`);
  });
}

function createOptions(selected: readonly boolean[]): readonly InteractiveOption[] {
  return OPTION_LABELS.map((label, index) => {
    const isSelected = selected[index] ?? false;
    return { label, selected: isSelected };
  });
}

function selectionFromOptions(options: readonly InteractiveOption[]): InteractiveSelection {
  return {
    syncState: options[0]?.selected ?? false,
    chapterNumbers: options
      .slice(1, 4)
      .flatMap((option, index) => (option.selected ? [index + 1] : [])),
    rebuildGraph: options[4]?.selected ?? false,
  };
}

function isBackKey(key: Key): boolean {
  return key.name === 'backspace' || key.name === 'escape';
}

function readSelection(): Promise<InteractiveSelection | undefined> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    const error = new Error('Interactive CLI requires a TTY. Use explicit subcommands in non-interactive environments.');
    logger.error('TTY not available for interactive CLI');
    throw error;
  }

  logger.debug('Starting interactive selection mode');
  const selected = OPTION_LABELS.map(() => false);
  let cursor = 0;
  const options = (): readonly InteractiveOption[] => createOptions(selected);

  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  renderMenu(options(), cursor);

  return new Promise((resolve) => {
    const onKeypress = (_input: string, key: Key): void => {
      if (isBackKey(key)) {
        logger.debug('User cancelled interactive selection');
        process.stdin.setRawMode(false);
        process.stdin.off('keypress', onKeypress);
        process.stdout.write('\n');
        resolve(undefined);
        return;
      }

      if (key.name === 'up' || key.name === 'down') {
        cursor = moveCursor(cursor, key.name, OPTION_LABELS.length);
      } else if (key.name === 'space') {
        const nextSelected = toggleOption(selected, cursor);
        nextSelected.forEach((value, index) => {
          selected[index] = value;
        });
      } else if (key.name === 'return') {
        const selection = selectionFromOptions(options());
        logger.info(
          {
            syncState: selection.syncState,
            chapterCount: selection.chapterNumbers.length,
            rebuildGraph: selection.rebuildGraph,
          },
          'User confirmed interactive selection',
        );
        process.stdin.setRawMode(false);
        process.stdin.off('keypress', onKeypress);
        process.stdout.write('\n');
        resolve(selection);
        return;
      }

      renderMenu(options(), cursor);
    };

    process.stdin.on('keypress', onKeypress);
  });
}

export async function runInteractiveCli(): Promise<InteractiveSelection | undefined> {
  logger.debug('Initializing interactive CLI');
  const result = await readSelection();
  logger.info(
    { selected: result !== undefined },
    'Interactive CLI completed',
  );
  return result;
}