// Runs only if no route matched the request.
const AppError = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

module.exports = notFound;
