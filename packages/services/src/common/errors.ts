export interface ErrorDetail {
  readonly message: string;
  readonly stack?: string | undefined;
}

/** Normalizes an unknown caught value into a loggable `{ message, stack }` pair. */
export function describeError(cause: unknown): ErrorDetail {
  return cause instanceof Error
    ? { message: cause.message, stack: cause.stack }
    : { message: String(cause) };
}
