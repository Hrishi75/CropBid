// =============================================================================
// Global Error Handler Middleware
// =============================================================================
// WHY A GLOBAL ERROR HANDLER?
// Without this, every route would need its own try-catch:
//
//   app.get('/users', async (req, res) => {
//     try {
//       const users = await prisma.user.findMany();
//       res.json(users);
//     } catch (err) {
//       res.status(500).json({ error: 'Something went wrong' });
//     }
//   });
//
// With the global error handler, you just throw an error anywhere in the stack
// and it gets caught here. The controller becomes:
//
//   app.get('/users', async (req, res) => {
//     const users = await prisma.user.findMany();
//     res.json(users);
//   });
//
// Express catches the error and routes it to this middleware.
//
// HOW EXPRESS ERROR HANDLERS WORK:
// A middleware with 4 parameters (err, req, res, next) is an error handler.
// Express skips all normal middleware and jumps straight to error handlers
// when an error is thrown or passed to next(err).
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // If it's our custom ApiError, use its status code
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: true,
      message: err.message,
      statusCode: err.statusCode,
      // Only present on errors the client is meant to branch on (see ApiError).
      ...(err.code ? { code: err.code } : {}),
    });
    return;
  }

  // For JWT-specific errors, send appropriate status codes
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: true,
      message: 'Invalid token',
      statusCode: 401,
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      error: true,
      message: 'Token expired',
      statusCode: 401,
    });
    return;
  }

  // Malformed JSON body — express.json() throws a SyntaxError with the
  // offending `body` attached. Bad input from the client, not a bug: 400.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: true,
      message: 'Invalid JSON in request body',
      statusCode: 400,
    });
    return;
  }

  // For unexpected errors (bugs), log the full error but send a generic message
  // NEVER send error.stack or internal details to the client in production
  console.error('❌ Unexpected error:', err);

  res.status(500).json({
    error: true,
    message: 'Internal server error',
    statusCode: 500,
  });
}
