const prisma = require('../../config/prisma');

function findAll() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } });
}

function findById(id) {
  // _count adds "how many products are in this category" without loading them.
  return prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
}

function create(data) {
  return prisma.category.create({ data });
}

function update(id, data) {
  return prisma.category.update({ where: { id }, data });
}

module.exports = { findAll, findById, create, update };
