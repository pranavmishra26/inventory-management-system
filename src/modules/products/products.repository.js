const prisma = require('../../config/prisma');

// Every product response includes its category's id and name (a JOIN).
const withCategory = { category: { select: { id: true, name: true } } };

// Translates API filters into a Prisma `where` object (= the SQL WHERE clause).
function buildWhere({ search, categoryId, active }) {
  const where = {};
  if (search) {
    // WHERE (name ILIKE '%search%' OR sku ILIKE '%search%')
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (categoryId !== undefined) where.categoryId = categoryId;
  if (active !== undefined) where.active = active;
  return where;
}

function findMany(filters, { skip, take }) {
  return prisma.product.findMany({
    where: buildWhere(filters),
    include: withCategory,
    orderBy: { id: 'asc' },
    skip,
    take,
  });
}

function count(filters) {
  return prisma.product.count({ where: buildWhere(filters) });
}

function findById(id) {
  return prisma.product.findUnique({ where: { id }, include: withCategory });
}

// WHERE id IN (...) - one query for many products.
function findByIds(ids) {
  return prisma.product.findMany({ where: { id: { in: ids } } });
}

function create(data) {
  return prisma.product.create({ data, include: withCategory });
}

function update(id, data) {
  return prisma.product.update({ where: { id }, data, include: withCategory });
}

module.exports = { findMany, count, findById, findByIds, create, update };
