import type { BootstrapHealthIssue, BootstrapHealthReport } from '../types';

function asIssue(code: string, severity: 'warning' | 'error', message: string, fixHint?: string): BootstrapHealthIssue {
  return { code, severity, message, fixHint };
}

function collectMissingIssues(missingArtifacts: ReadonlyArray<string>): BootstrapHealthIssue[] {
  return missingArtifacts.map((artifact) => asIssue(
    `missing-${artifact}`,
    'warning',
    `缺失 ${artifact} 工件。`,
    `先补齐 ${artifact} 后再推进写作。`,
  ));
}

function collectReferenceIssues(unresolvedReferences: ReadonlyArray<string>): BootstrapHealthIssue[] {
  return unresolvedReferences.map((reference) => asIssue(
    `broken-reference-${reference}`,
    'error',
    `引用 ${reference} 断裂。`,
    '补齐引用或清理失效路径。',
  ));
}

function collectValidationIssues(validationErrors: ReadonlyArray<{ readonly path: string; readonly reason: string }>): BootstrapHealthIssue[] {
  return validationErrors.map((error) => asIssue(
    `invalid-${error.path}`,
    'error',
    `文件 ${error.path} 未通过 canonical 校验：${error.reason}`,
    '修正文件内容后重新导入，或调整导入映射。',
  ));
}

function buildPrioritySequence(missingArtifacts: ReadonlyArray<string>): readonly string[] {
  return missingArtifacts.length > 0 ? [...new Set(missingArtifacts)] : ['project-brief'];
}

function isImportReady(
  allMissing: readonly string[],
  unresolvedReferences: readonly string[],
  validationErrors: readonly { readonly path: string; readonly reason: string }[],
): boolean {
  return allMissing.length === 0 && unresolvedReferences.length === 0 && validationErrors.length === 0;
}

export function generateReport(
  missingArtifacts: ReadonlyArray<string>,
  unresolvedReferences: ReadonlyArray<string> = [],
  validationErrors: ReadonlyArray<{ readonly path: string; readonly reason: string }> = [],
  additionalIssues: readonly BootstrapHealthIssue[] = [],
): BootstrapHealthReport {
  const allMissing = [...new Set(missingArtifacts)];
  const issues = [
    ...collectMissingIssues(allMissing),
    ...collectReferenceIssues(unresolvedReferences),
    ...collectValidationIssues(validationErrors),
    ...additionalIssues,
  ];
  const prioritySequence = buildPrioritySequence(allMissing);

  return {
    ready: isImportReady(allMissing, unresolvedReferences, validationErrors),
    issues,
    missingArtifacts: allMissing,
    prioritySequence,
  };
}

export function generatePrioritySequence(missingArtifacts: ReadonlyArray<string>): readonly string[] {
  return buildPrioritySequence(missingArtifacts);
}

export function canProceedToWriting(report: BootstrapHealthReport): boolean {
  return report.ready;
}
