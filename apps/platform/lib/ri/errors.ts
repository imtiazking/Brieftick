export class RiConfigurationError extends Error {
  constructor(message = 'Supabase is not configured for RI data access') {
    super(message);
    this.name = 'RiConfigurationError';
  }
}

export class RiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RiValidationError';
  }
}

export class RiNotFoundError extends Error {
  constructor(message = 'not_found') {
    super(message);
    this.name = 'RiNotFoundError';
  }
}

export class RiConflictError extends Error {
  constructor(message = 'conflict') {
    super(message);
    this.name = 'RiConflictError';
  }
}
