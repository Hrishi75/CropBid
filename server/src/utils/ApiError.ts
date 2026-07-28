// =============================================================================
// Custom API Error Class
// =============================================================================
// WHY A CUSTOM ERROR CLASS?
// JavaScript's built-in Error only has a message. In an API, you also need:
//   - statusCode: What HTTP status to send (400, 401, 403, 404, 500)
//   - A way to distinguish "expected" errors (wrong password → 401) from
//     "unexpected" errors (database crash → 500)
//
// The global error handler (errorHandler.ts) catches these and sends a
// consistent JSON response. Without this, every controller would need
// its own try-catch with manual status code logic.
//
// USAGE:
//   throw new ApiError(401, 'Invalid email or password');
//   throw new ApiError(404, 'Listing not found');
//   throw new ApiError(403, 'You can only edit your own listings');
//
// The optional third argument is a stable machine-readable `code`. Pass one
// only when the client must BRANCH on which error this is — the message is
// user-facing copy and may be reworded or translated at any time, so clients
// must never match on it. Everything else can go on message alone.
//   throw new ApiError(401, 'Signed out after 15 minutes…', 'SESSION_IDLE');
// =============================================================================

export class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;

    // "Operational" means we expected this error (bad input, not found, etc.)
    // Non-operational errors are bugs (null pointer, missing env var, etc.)
    this.isOperational = true;

    // Ensures the stack trace starts from where the error was thrown,
    // not from inside this constructor
    Error.captureStackTrace(this, this.constructor);
  }
}
