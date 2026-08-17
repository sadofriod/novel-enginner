/* eslint-disable complexity, max-lines-per-function */
import { handleInlineEdit } from '../../proposal/proposal';
import { resolveCanonicalPathForArtifact } from '../../../canonical-draft';
import { jsonResponse, readFormValue, redirectResponse } from '../../transport/http';

import type { Proposal } from '../../../../domain';
import type { CommandCrossReferences, RouteHandlerDeps } from './context';

const INLINE_EDIT_CHAR_LIMIT = 200;

export interface WebCommandHandlers {
  readonly handleWebCommandAction: (request: Request) => Promise<Response>;
  readonly handleWebSystemCommand: (request: Request) => Promise<Response>;
}

export function createWebCommandHandlers(
  deps: RouteHandlerDeps,
  cross: CommandCrossReferences,
): WebCommandHandlers {
  const { store, logger } = deps;

  async function handleWebCommandAction(request: Request): Promise<Response> {
    const form = await request.formData();
    const artifactType = readFormValue(form, 'artifactType');
    const targetId = readFormValue(form, 'targetId');
    const intent = readFormValue(form, 'intent');
    const redirectTo = readFormValue(form, 'redirectTo') ?? '/app';

    logger.debug({ artifactType, targetId, intent }, 'Web command action received');

    if (artifactType === undefined || targetId === undefined || intent === undefined) {
      logger.warn({ artifactType, targetId, intent }, 'Missing required fields in web command action');
      return redirectResponse(redirectTo);
    }

    if (intent === 'delete') {
      logger.info({ artifactType, targetId }, 'Deleting artifact');
      store.deleteArtifact(artifactType, targetId);
      logger.info({ artifactType, targetId }, 'Artifact deleted successfully');
      return redirectResponse('/app');
    }

    const note = readFormValue(form, 'note');
    if (note !== undefined && [...note].length > INLINE_EDIT_CHAR_LIMIT) {
      logger.warn({ noteLength: [...note].length, limit: INLINE_EDIT_CHAR_LIMIT }, 'Inline edit exceeds character limit');
      return jsonResponse({ status: 'rejected', code: 'inline-edit-too-long', message: `Inline edits are limited to ${INLINE_EDIT_CHAR_LIMIT} characters.` }, 400);
    }

    if (note !== undefined && note.trim().length > 0) {
      logger.debug({ artifactType, targetId, noteLength: note.trim().length }, 'Processing inline edit');
      const outcome = handleInlineEdit(store, artifactType, targetId, note.trim());
      if (outcome !== undefined && outcome.wasApprovedBeforeEdit) {
        await dispatchInlineEditReview(logger, deps.dispatchSyntheticReview, {
          workspaceId: readFormValue(form, 'workspaceId') ?? 'workspace-local',
          bookId: readFormValue(form, 'bookId') ?? 'book-local',
          artifactType: artifactType as Proposal['artifactType'],
          targetId,
          note: note.trim(),
          ...(outcome.activeProposalId === undefined ? {} : { activeProposalId: outcome.activeProposalId }),
        });
      }
      logger.debug({ artifactType, targetId }, 'Inline edit processed');
    }

    await cross.handlePostCommand(new Request('http://local.test/commands', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: readFormValue(form, 'workspaceId') ?? 'workspace-local',
        bookId: readFormValue(form, 'bookId') ?? 'book-local', artifactType, targetId, intent,
        requestedBy: 'author-local', approvalMode: 'manual', idempotencyKey: `web-${intent}-${targetId}-${Date.now().toString(36)}`,
      }),
    }));
    return redirectResponse(redirectTo);
  }

  async function handleWebSystemCommand(request: Request): Promise<Response> {
    const form = await request.formData();
    const intent = readFormValue(form, 'intent');
    const workspaceId = readFormValue(form, 'workspaceId');
    const bookId = readFormValue(form, 'bookId');
    const redirectTo = readFormValue(form, 'redirectTo') ?? '/app';

    logger.debug({ intent, workspaceId, bookId }, 'Web system command received');

    if (intent === undefined || workspaceId === undefined || bookId === undefined) {
      logger.warn({ intent, workspaceId, bookId }, 'Missing required fields in web system command');
      return redirectResponse(redirectTo);
    }

    logger.info({ intent, workspaceId, bookId }, 'Processing web system command');

    const body = {
      workspaceId,
      bookId,
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: `web-${intent}-${Date.now().toString(36)}`,
      ...(readFormValue(form, 'artifactType') === undefined ? {} : { artifactType: readFormValue(form, 'artifactType') }),
      ...(readFormValue(form, 'targetId') === undefined ? {} : { targetId: readFormValue(form, 'targetId') }),
      intent,
      systemTaskType: intent === 're-sync-state' || intent === 'rebuild-graph' ? intent : undefined,
    };
    const commandRequest = new Request('http://local.test/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (intent === 're-sync-state' || intent === 'rebuild-graph') {
      await cross.handleSyncCommand(intent, commandRequest);
    } else {
      await cross.handlePostCommand(commandRequest);
    }
    logger.info({ intent }, 'Web system command completed');
    return redirectResponse(redirectTo);
  }

  return { handleWebCommandAction, handleWebSystemCommand };
}

/** Queues a synthetic re-review for an approved artifact that was hand-edited inline. */
async function dispatchInlineEditReview(
  log: RouteHandlerDeps['logger'],
  dispatch: RouteHandlerDeps['dispatchSyntheticReview'],
  input: {
    readonly workspaceId: string;
    readonly bookId: string;
    readonly artifactType: Proposal['artifactType'];
    readonly targetId: string;
    readonly note: string;
    readonly activeProposalId?: string;
  },
): Promise<void> {
  if (dispatch === undefined) {
    return;
  }
  try {
    await dispatch({
      workspaceId: input.workspaceId,
      bookId: input.bookId,
      artifactType: input.artifactType,
      targetId: input.targetId,
      editedFilePath: resolveCanonicalPathForArtifact(input.artifactType, input.targetId),
      editedText: input.note,
      ...(input.activeProposalId === undefined ? {} : { proposalId: input.activeProposalId }),
    });
    log.info({ artifactType: input.artifactType, targetId: input.targetId }, 'Synthetic re-review dispatched after inline edit');
  } catch (error) {
    log.warn({ artifactType: input.artifactType, targetId: input.targetId, error }, 'Synthetic re-review dispatch failed');
  }
}
