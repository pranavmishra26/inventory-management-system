// Registration and login. Reuses users.repository (no separate auth repository needed).

const bcrypt = require('bcryptjs');
const AppError = require('../../utils/AppError');
const { signToken } = require('../../utils/jwt');
const usersRepository = require('../users/users.repository');

const SALT_ROUNDS = 10; // cost factor: 2^10 hashing rounds, deliberately slow for attackers

async function register({ name, email, password }) {
  const existing = await usersRepository.findByEmail(email);
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Role is NOT taken from the request: self-registration is always VIEWER.
  // An ADMIN can promote users later via PATCH /users/:id/role.
  return usersRepository.create({ name, email, passwordHash, role: 'VIEWER' });
}

async function login({ email, password }) {
  const user = await usersRepository.findByEmailWithPassword(email);

  // Same error for "no such email" and "wrong password", so attackers
  // cannot use the login form to discover which emails are registered.
  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const { passwordHash, ...publicUser } = user; // strip the hash before returning
  return { token: signToken(user), user: publicUser };
}

module.exports = { register, login };
