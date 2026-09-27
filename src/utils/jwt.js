// Signing and verifying JSON Web Tokens.
// A JWT is three base64 parts: header.payload.signature. The payload is readable by
// anyone; the signature (HMAC-SHA256 with JWT_SECRET) proves WE issued it and that
// nobody changed it. So: never put secrets in the payload, and keep JWT_SECRET secret.

const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signToken(user) {
  // `sub` (subject) is the standard claim for "who this token is about".
  return jwt.sign({ sub: String(user.id), role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

// Throws TokenExpiredError / JsonWebTokenError if invalid (mapped to 401 in errorHandler).
function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
