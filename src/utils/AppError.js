// An error we throw on purpose, carrying the HTTP status to return.
// Services throw these; the central errorHandler turns them into JSON.
// Spring equivalent: a custom exception + @ResponseStatus / @ControllerAdvice mapping.

class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode; // e.g. 404
    this.code = code;             // e.g. 'PRODUCT_NOT_FOUND' (stable, machine-readable)
    this.details = details;       // optional extra info (e.g. which items are short)
  }
}

module.exports = AppError;
