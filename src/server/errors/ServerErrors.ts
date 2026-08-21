import { HttpError } from './HttpError';

/**
 * 500 Internal Server Error
 * Unexpected server-side error
 */
export class InternalServerError extends HttpError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

/**
 * 502 Bad Gateway
 * Invalid response from upstream server (external API failures)
 */
export class BadGatewayError extends HttpError {
  constructor(message: string = 'Bad gateway', details?: unknown) {
    super(message, 502, 'BAD_GATEWAY', details);
  }
}

/**
 * 503 Service Unavailable
 * Service temporarily unavailable (maintenance, overload)
 */
export class ServiceUnavailableError extends HttpError {
  constructor(message: string = 'Service unavailable', details?: unknown) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}
