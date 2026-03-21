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
// =============================================================================

export class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;

    // "Operational" means we expected this error (bad input, not found, etc.)
    // Non-operational errors are bugs (null pointer, missing env var, etc.)
    this.isOperational = true;

    // Ensures the stack trace starts from where the error was thrown,
    // not from inside this constructor
    Error.captureStackTrace(this, this.constructor);
  }
}
