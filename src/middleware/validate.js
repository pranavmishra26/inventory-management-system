// validate({ body, query, params }) -> middleware that checks the request with Zod.
// On success the parsed (trimmed, coerced, defaulted) values replace the raw ones,
// so controllers can trust req.body / req.query / req.params.
// On failure it passes a 400 error to the error handler.
// Spring equivalent: @Valid @RequestBody + Bean Validation.

const AppError = require('../utils/AppError');

function validate(schemas) {
  return (req, res, next) => {
    const issues = [];

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({ location: part, field: issue.path.join('.'), message: issue.message });
        }
        continue;
      }
      if (part === 'query') {
        // Express 5 makes req.query a read-only getter, so we shadow it with our parsed copy.
        Object.defineProperty(req, 'query', { value: result.data, writable: true });
      } else {
        req[part] = result.data;
      }
    }

    if (issues.length > 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', issues));
    }
    next();
  };
}

module.exports = validate;
