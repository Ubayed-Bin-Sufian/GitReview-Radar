/**
 * Custom error classes for PR-Pulse
 */

import { APIGatewayProxyResult } from 'aws-lambda';

/**
 * API Error with status code and error code
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Validation Error for input validation failures
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Handle API errors and return proper response
 */
export function handleApiError(error: unknown): APIGatewayProxyResult {
  console.error('Error details:', error);

  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  // Unhandled error
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
      },
    }),
  };
}
