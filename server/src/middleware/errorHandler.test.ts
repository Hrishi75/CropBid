// =============================================================================
// errorHandler tests — status mapping for the error types we care about
// =============================================================================
// The handler is the last line of defence: ApiError keeps its status, malformed
// JSON from express.json() is the client's fault (400), and anything unknown
// must collapse to a generic 500 that leaks nothing.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from './errorHandler';
import { ApiError } from '../utils/ApiError';

function mockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

const req = {} as Request;
const next = (() => {}) as NextFunction;

describe('errorHandler', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('uses the ApiError status code and message', () => {
    const res = mockRes();
    errorHandler(new ApiError(409, 'An account with this email already exists'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: true,
      message: 'An account with this email already exists',
      statusCode: 409,
    });
  });

  it('answers 400 for a malformed JSON body (SyntaxError with `body`)', () => {
    const res = mockRes();
    // express.json() attaches the raw body to the SyntaxError it throws.
    const err = Object.assign(new SyntaxError('Unexpected token < in JSON'), { body: '<html>' });
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: true,
      message: 'Invalid JSON in request body',
      statusCode: 400,
    });
  });

  it('does not treat an unrelated SyntaxError as bad input', () => {
    const res = mockRes();
    errorHandler(new SyntaxError('broken template literal'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('collapses unknown errors to a generic 500 without leaking details', () => {
    const res = mockRes();
    errorHandler(new Error('connect ECONNREFUSED 127.0.0.1:5432'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: true,
      message: 'Internal server error',
      statusCode: 500,
    });
    // The real error is logged for on-call, not sent to the client.
    expect(errorSpy).toHaveBeenCalled();
  });
});
