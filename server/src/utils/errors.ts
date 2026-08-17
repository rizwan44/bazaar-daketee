/** A user-facing error with a stable machine-readable code, safe to send to the client as-is. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
