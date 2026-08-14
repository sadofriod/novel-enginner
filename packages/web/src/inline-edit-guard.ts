const INLINE_EDIT_CHAR_LIMIT = 200;

/**
 * Enforces the Web inline-edit boundary from
 * docs/architecture/modules/06-web-console-and-approval.md §6.6: short free-text
 * touch-ups are allowed up to ~200 characters total; anything longer must be exported
 * to `drafts/` or edited in VS Code instead.
 */
export function isWithinInlineEditLimit(text: string): boolean {
  return [...text].length <= INLINE_EDIT_CHAR_LIMIT;
}

export function inlineEditCharCount(text: string): number {
  return [...text].length;
}

export { INLINE_EDIT_CHAR_LIMIT };
