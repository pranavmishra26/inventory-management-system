// Data access for orders. Write functions accept an optional `db` (the transaction
// client `tx`) exactly like inventory.repository.js.

const prisma = require('../../config/prisma');

const orderInclude = {
  warehouse: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  items: {
    orderBy: { productId: 'asc' },
    include: { product: { select: { id: true, sku: true, name: true } } },
  },
};

// Single order view also shows the STOCK_OUT movements created when it was confirmed.
const orderDetailInclude = {
  ...orderInclude,
  stockMovements: {
    orderBy: { id: 'asc' },
    select: { id: true, type: true, quantity: true, productId: true, createdAt: true },
  },
};

// Nested write: the order row and all its item rows are inserted by one Prisma call,
// which Prisma runs in a single transaction.
function createWithItems({ orderNumber, warehouseId, createdById, items }) {
  return prisma.order.create({
    data: {
      orderNumber,
      warehouseId,
      createdById,
      items: { create: items.map(({ productId, quantity }) => ({ productId, quantity })) },
    },
    include: orderInclude,
  });
}

function findById(id, db = prisma) {
  return db.order.findUnique({ where: { id }, include: orderDetailInclude });
}

function findMany({ status }, { skip, take }) {
  return prisma.order.findMany({
    where: status ? { status } : {},
    include: orderInclude,
    orderBy: { id: 'desc' },
    skip,
    take,
  });
}

function count({ status }) {
  return prisma.order.count({ where: status ? { status } : {} });
}

// Conditional status change - ONE atomic SQL statement:
//   UPDATE orders SET status = :to WHERE id = :id AND status = :from
// Returns true only if this call actually moved the order. If two requests try to
// confirm the same order at once, only one of them can match `status = PENDING`.
async function updateStatusIf(id, from, to, db = prisma) {
  const result = await db.order.updateMany({
    where: { id, status: from },
    data: { status: to },
  });
  return result.count === 1;
}

module.exports = { createWithItems, findById, findMany, count, updateStatusIf };
