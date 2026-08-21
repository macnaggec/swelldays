import { HttpError } from './HttpError';

/**
 * 400 Bad Request
 * Client sent invalid data (validation errors, malformed requests)
 */
export class BadRequestError extends HttpError {
  constructor(message: string = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/**
 * 401 Unauthorized
 * Authentication required or failed (invalid credentials, expired token)
 */
export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Authentication required', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

/**
 * 403 Forbidden
 * User authenticated but lacks permission for this resource
 */
export class ForbiddenError extends HttpError {
  constructor(message: string = 'Access forbidden', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

/**
 * 404 Not Found
 * Requested resource doesn't exist
 */
export class NotFoundError extends HttpError {
  constructor(resource: string = 'Resource', details?: unknown) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
  }
}

/**
 * 409 Conflict
 * Request conflicts with current state (duplicate entry, version mismatch)
 */
export class ConflictError extends HttpError {
  constructor(message: string = 'Resource conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * 422 Unprocessable Entity
 * Request well-formed but semantically invalid (business rule violations)
 */
export class UnprocessableEntityError extends HttpError {
  constructor(message: string = 'Unprocessable entity', details?: unknown) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }
}

/**
 * 429 Too Many Requests
 * Client has exceeded the rate limit for this resource
 */
export class TooManyRequestsError extends HttpError {
  constructor(message: string = 'Too many requests', details?: unknown) {
    super(message, 429, 'TOO_MANY_REQUESTS', details);
  }
}
