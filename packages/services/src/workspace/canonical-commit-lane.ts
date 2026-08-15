type CommitTask<T> = () => Promise<T>;

const tailByBookId = new Map<string, Promise<void>>();

export async function withCanonicalCommitLane<T>(bookId: string, task: CommitTask<T>): Promise<T> {
  const previous = tailByBookId.get(bookId) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  tailByBookId.set(bookId, queued);

  await previous;
  try {
    return await task();
  } finally {
    release?.();
    if (tailByBookId.get(bookId) === queued) {
      tailByBookId.delete(bookId);
    }
  }
}
