const AppError = require('../../utils/AppError');
const { toSkipTake, buildMeta } = require('../../utils/pagination');
const usersRepository = require('./users.repository');

async function listUsers(pagination) {
  const [users, total] = await Promise.all([
    usersRepository.findMany(toSkipTake(pagination)),
    usersRepository.count(),
  ]);
  return { data: users, meta: buildMeta(pagination, total) };
}

async function getUser(id) {
  const user = await usersRepository.findById(id);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
  return user;
}

async function changeRole(targetId, newRole, currentUser) {
  // Prevents an admin from demoting themselves and locking everyone out of admin actions.
  if (targetId === currentUser.id) {
    throw new AppError(409, 'CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role');
  }
  await getUser(targetId); // 404 if missing
  return usersRepository.updateRole(targetId, newRole);
}

module.exports = { listUsers, getUser, changeRole };
