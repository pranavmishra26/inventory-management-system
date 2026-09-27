// AUTHORIZATION: "What are you allowed to do?"
// authorize('ADMIN', 'STAFF') returns a middleware that only lets those roles through.
// Must run AFTER authenticate (it relies on req.user).
// Spring equivalent: @PreAuthorize("hasAnyRole('ADMIN','STAFF')").

const AppError = require('../utils/AppError');

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }
    next();
  };
}

module.exports = authorize;
