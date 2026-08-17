let runSequence = 0;
let commandSequence = 0;

export function nextRunId(): string {
  runSequence += 1;
  return `run-${runSequence.toString().padStart(6, '0')}`;
}

export function nextCommandId(): string {
  commandSequence += 1;
  return `cmd-${commandSequence.toString().padStart(6, '0')}`;
}
