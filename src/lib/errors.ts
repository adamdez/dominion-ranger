export class RangerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RangerError';
  }
}

export class NotFoundError extends RangerError {
  constructor(entity: string, identifier: string) {
    super(`${entity} not found: ${identifier}`, 'NOT_FOUND', 404);
  }
}

export class DuplicateError extends RangerError {
  constructor(entity: string, identifier: string) {
    super(`${entity} already exists: ${identifier}`, 'DUPLICATE', 409);
  }
}

export class ValidationError extends RangerError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, metadata);
  }
}

export class AuthorizationError extends RangerError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'UNAUTHORIZED', 403);
  }
}

export class ConcurrencyError extends RangerError {
  constructor(resource: string, id: string) {
    super(`Concurrent modification on ${resource} ${id}`, 'CONCURRENCY_ERROR', 409);
  }
}

export class ComplianceError extends RangerError {
  constructor(reason: string, dominionLeadId: string) {
    super(`Compliance block: ${reason} for ${dominionLeadId}`, 'COMPLIANCE_ERROR', 403);
  }
}
