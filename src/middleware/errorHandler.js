// Centralized error handler: the ONE place where errors become HTTP responses.
// Express recognises an error handler by its 4 parameters (err, req, res, next).
// Spring equivalent: @ControllerAdvice + @ExceptionHandler.
//
// Services just `throw`; Express 5 forwards thrown/rejected errors here automatically,
// so controllers need no try/catch.

const { Prisma } = require('@prisma/client');
const AppError = require('../utils/AppError');

function send(res, status, code, message, details) {
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  return res.status(status).json(body);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Errors we threw deliberately (validation, not found, conflicts, forbidden...)
  if (err instanceof AppError) {
    return send(res, err.statusCode, err.code, err.message, err.details);
  }

  // Malformed JSON body sent by the client
  if (err.type === 'entity.parse.failed') {
    return send(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  // Other body-parsing problems (e.g. body too large -> 413)
  if (err.type && err.status >= 400 && err.status < 500) {
    return send(res, err.status, 'BAD_REQUEST', err.message);
  }

  // JWT problems -> 401
  if (err.name === 'TokenExpiredError') {
    return send(res, 401, 'TOKEN_EXPIRED', 'Token has expired, please log in again');
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    return send(res, 401, 'INVALID_TOKEN', 'Invalid token');
  }

  // Known database errors -> meaningful status codes, without leaking SQL details
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      // Unique constraint violated (e.g. duplicate SKU). The driver tells us which field(s).
      const fields = err.meta?.driverAdapterError?.cause?.constraint?.fields ?? err.meta?.target;
      const which = Array.isArray(fields) ? fields.join(', ') : 'a unique field';
      return send(res, 409, 'DUPLICATE_VALUE', `A record with this ${which} already exists`);
    }
    if (err.code === 'P2025') {
      return send(res, 404, 'NOT_FOUND', 'Record not found');
    }
    if (err.code === 'P2003') {
      return send(res, 409, 'INVALID_REFERENCE', 'Referenced record does not exist or is still in use');
    }
  }

  // A PostgreSQL CHECK constraint fired (e.g. quantity >= 0). The service rules should
  // prevent this; if one ever slips through, the DB refuses and we answer 409, not 500.
  if (err.cause?.code === '23514') {
    return send(res, 409, 'CONSTRAINT_VIOLATION', 'The operation violates a data integrity rule');
  }

  // Anything else is a bug or an infrastructure failure.
  // Log the real error on the server, but never leak internals to the client.
  console.error(err);
  return send(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
}

module.exports = errorHandler;
