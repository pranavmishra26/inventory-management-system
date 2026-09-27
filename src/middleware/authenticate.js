// AUTHENTICATION: "Who are you?"
// Reads "Authorization: Bearer <token>", verifies the JWT, loads the user and
// attaches it as req.user for everything that runs after this middleware.
// Spring equivalent: a OncePerRequestFilter that fills the SecurityContext.

const AppError = require('../utils/AppError');
const { verifyToken } = require('../utils/jwt');
const usersRepository = require('../modules/users/users.repository');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header');
  }

  const payload = verifyToken(token); // throws on bad signature / expiry -> 401

  // Load the user fresh from the DB so a changed role takes effect immediately.
  const user = await usersRepository.findById(Number(payload.sub));
  if (!user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'User for this token no longer exists');
  }

  req.user = user; // { id, name, email, role, createdAt, updatedAt } - never the hash
  next();
}

module.exports = authenticate;
