/**
 * Centralized error exports
 * Import errors from this file throughout the application
 */

import { HttpError } from './HttpError';

// Base error
export { HttpError } from './HttpError';

// Client errors (4xx)
export {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  TooManyRequestsError,
} from './ClientErrors';

// Server errors (5xx)
export {
  InternalServerError,
  BadGatewayError,
  ServiceUnavailableError,
} from './ServerErrors';

// Type guard to check if error is an HttpError
export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
