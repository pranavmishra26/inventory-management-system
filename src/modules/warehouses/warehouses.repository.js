const prisma = require('../../config/prisma');

function findAll({ active }) {
  return prisma.warehouse.findMany({
    where: active === undefined ? {} : { active },
    orderBy: { name: 'asc' },
  });
}

function findById(id) {
  return prisma.warehouse.findUnique({ where: { id } });
}

function create(data) {
  return prisma.warehouse.create({ data });
}

function update(id, data) {
  return prisma.warehouse.update({ where: { id }, data });
}

module.exports = { findAll, findById, create, update };
