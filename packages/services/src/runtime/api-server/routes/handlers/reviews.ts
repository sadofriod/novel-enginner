import { z } from 'zod';

import type { ReviewComment, ReviewThread } from '../../../../domain';
import { NonEmptyStringSchema, PositiveIntegerSchema, StableIdSchema } from '../../../../domain/schemas/common';
import { THREAD_SIDE_VALUES } from '../../../../domain/values';
import { resolveThread, unresolveThread } from '../../../../workflow/review-lifecycle';
import { loadProposalChain } from '../../proposal/chain';
import { persistComment, persistDeleteComment, persistEditComment, persistReviewThread, persistThreadResolved, persistThreadUnresolved } from '../../../../persistence/reviews';
import { jsonResponse } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

export interface ReviewHandlers {
  readonly handleListProposalThreads: (proposalId: string) => Promise<Response>;
  readonly handleGetProposalChain: (proposalId: string) => Promise<Response>;
  readonly handleCreateProposalThread: (proposalId: string, request: Request) => Promise<Response>;
  readonly handleAddThreadComment: (threadId: string, request: Request) => Promise<Response>;
  readonly handleResolveThread: (threadId: string, request: Request) => Promise<Response>;
  readonly handleUnresolveThread: (threadId: string) => Promise<Response>;
  readonly handleEditComment: (commentId: string, request: Request) => Promise<Response>;
  readonly handleDeleteComment: (commentId: string) => Promise<Response>;
}

const NewThreadRequestSchema = z
  .object({
    field: NonEmptyStringSchema,
    side: z.enum(THREAD_SIDE_VALUES),
    lineNumber: PositiveIntegerSchema,
    lineSnapshot: z.string(),
    body: NonEmptyStringSchema,
    author: StableIdSchema.default('author'),
  })
  .readonly();

const CommentRequestSchema = z
  .object({
    body: NonEmptyStringSchema,
    author: StableIdSchema.default('author'),
  })
  .readonly();

function persistenceEnabled(): boolean {
  return process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
}

function now(): string {
  return new Date().toISOString();
}

function id(): string {
  return crypto.randomUUID();
}

async function readAuthor(request: Request): Promise<string> {
  const payload = (await request.json().catch(() => ({}))) as { by?: string };
  return typeof payload.by === 'string' && payload.by !== '' ? payload.by : 'author';
}

function createChainHandler(deps: RouteHandlerDeps) {
  const { store, logger } = deps;
  return async function handleGetProposalChain(proposalId: string): Promise<Response> {
    const persistenceEnabled =
      process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
    const chain = await loadProposalChain({ store, persistenceEnabled, startProposalId: proposalId });
    logger.debug({ proposalId, rounds: chain.length }, 'Loading proposal chain');
    return jsonResponse({ status: 'ok', chain });
  };
}

function createListHandler(deps: RouteHandlerDeps) {
  const { store, logger } = deps;
  return async function handleListProposalThreads(proposalId: string): Promise<Response> {
    const threads = store.listReviewThreads(proposalId).map((thread) => ({
      thread,
      comments: store.listReviewComments(thread.threadId),
    }));
    logger.debug({ proposalId, count: threads.length }, 'Listing review threads');
    return jsonResponse({ status: 'ok', threads });
  };
}

function createCreateThreadHandler(deps: RouteHandlerDeps) {
  const { store } = deps;
  return async function handleCreateProposalThread(
    proposalId: string,
    request: Request,
  ): Promise<Response> {
    const payload = (await request.json()) as Record<string, unknown>;
    const parsed = NewThreadRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonResponse({ status: 'rejected', code: 'bad-request', message: 'Invalid thread payload.' }, 400);
    }
    const thread: ReviewThread = {
      threadId: id(),
      proposalId,
      field: parsed.data.field,
      side: parsed.data.side,
      lineNumber: parsed.data.lineNumber,
      lineSnapshot: parsed.data.lineSnapshot,
      isResolved: false,
      createdAt: now(),
    };
    const comment: ReviewComment = {
      commentId: id(),
      threadId: thread.threadId,
      author: parsed.data.author,
      body: parsed.data.body,
      createdAt: now(),
    };
    store.saveReviewThread(thread);
    store.saveReviewComment(comment);
    if (persistenceEnabled()) {
      await persistReviewThread(thread);
      await persistComment(comment);
    }
    return jsonResponse({ status: 'ok', thread, comment });
  };
}

function createAddCommentHandler(deps: RouteHandlerDeps) {
  const { store } = deps;
  return async function handleAddThreadComment(threadId: string, request: Request): Promise<Response> {
    const thread = store.getReviewThread(threadId);
    if (thread === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown review thread.' }, 404);
    }
    const payload = (await request.json()) as Record<string, unknown>;
    const parsed = CommentRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonResponse({ status: 'rejected', code: 'bad-request', message: 'Invalid comment payload.' }, 400);
    }
    const comment: ReviewComment = {
      commentId: id(),
      threadId,
      author: parsed.data.author,
      body: parsed.data.body,
      createdAt: now(),
    };
    store.saveReviewComment(comment);
    if (persistenceEnabled()) {
      await persistComment(comment);
    }
    return jsonResponse({ status: 'ok', comment });
  };
}

function createResolveThreadHandler(deps: RouteHandlerDeps) {
  const { store } = deps;
  return async function handleResolveThread(threadId: string, request: Request): Promise<Response> {
    const thread = store.getReviewThread(threadId);
    if (thread === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown review thread.' }, 404);
    }
    const by = await readAuthor(request);
    const resolved = resolveThread(thread, by, now());
    store.saveReviewThread(resolved);
    if (persistenceEnabled()) {
      await persistThreadResolved(threadId, by, resolved.resolvedAt ?? now());
    }
    return jsonResponse({ status: 'ok', thread: resolved });
  };
}

function createUnresolveThreadHandler(deps: RouteHandlerDeps) {
  const { store } = deps;
  return async function handleUnresolveThread(threadId: string): Promise<Response> {
    const thread = store.getReviewThread(threadId);
    if (thread === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown review thread.' }, 404);
    }
    const unresolved = unresolveThread(thread);
    store.saveReviewThread(unresolved);
    if (persistenceEnabled()) {
      await persistThreadUnresolved(threadId);
    }
    return jsonResponse({ status: 'ok', thread: unresolved });
  };
}

function createEditCommentHandler(deps: RouteHandlerDeps) {
  const { store } = deps;
  return async function handleEditComment(commentId: string, request: Request): Promise<Response> {
    const comment = store.getReviewComment(commentId);
    if (comment === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown review comment.' }, 404);
    }
    const payload = (await request.json()) as { body?: string };
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    if (body.length === 0) {
      return jsonResponse({ status: 'rejected', code: 'bad-request', message: 'Comment body is required.' }, 400);
    }
    const updated: ReviewComment = { ...comment, body };
    store.saveReviewComment(updated);
    if (persistenceEnabled()) {
      await persistEditComment(commentId, body);
    }
    return jsonResponse({ status: 'ok', comment: updated });
  };
}

function createDeleteCommentHandler(deps: RouteHandlerDeps) {
  const { store } = deps;
  return async function handleDeleteComment(commentId: string): Promise<Response> {
    const comment = store.getReviewComment(commentId);
    if (comment === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown review comment.' }, 404);
    }
    store.deleteReviewComment(commentId);
    if (persistenceEnabled()) {
      await persistDeleteComment(commentId);
    }
    return jsonResponse({ status: 'ok', deleted: commentId });
  };
}

export function createReviewHandlers(deps: RouteHandlerDeps): ReviewHandlers {
  return {
    handleListProposalThreads: createListHandler(deps),
    handleGetProposalChain: createChainHandler(deps),
    handleCreateProposalThread: createCreateThreadHandler(deps),
    handleAddThreadComment: createAddCommentHandler(deps),
    handleResolveThread: createResolveThreadHandler(deps),
    handleUnresolveThread: createUnresolveThreadHandler(deps),
    handleEditComment: createEditCommentHandler(deps),
    handleDeleteComment: createDeleteCommentHandler(deps),
  };
}
