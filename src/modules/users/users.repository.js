// Data access for users. Only Prisma calls here, no business decisions.
// Spring equivalent: UserRepository extends JpaRepository<User, Long>.

const prisma = require('../../config/prisma');

// Columns that are safe to return to clients. passwordHash is deliberately excluded.
// `select` = choose columns, like a JPA projection / SELECT id, name, ...
const publicFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

function findById(id) {
  return prisma.user.findUnique({ where: { id }, select: publicFields });
}

function findByEmail(email) {
  return prisma.user.findUnique({ where: { email }, select: publicFields });
}

// Only used by login: the one place that needs the password hash.
function findByEmailWithPassword(email) {
  return prisma.user.findUnique({ where: { email } });
}

function create(data) {
  return prisma.user.create({ data, select: publicFields });
}

function findMany({ skip, take }) {
  return prisma.user.findMany({ skip, take, orderBy: { id: 'asc' }, select: publicFields });
}

function count() {
  return prisma.user.count();
}

function updateRole(id, role) {
  return prisma.user.update({ where: { id }, data: { role }, select: publicFields });
}

module.exports = {
  findById,
  findByEmail,
  findByEmailWithPassword,
  create,
  findMany,
  count,
  updateRole,
};
