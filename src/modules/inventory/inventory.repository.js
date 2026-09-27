// Data access for Inventory and StockMovement.
//
// The `db` parameter: every write function accepts an optional Prisma client.
//   - Called normally      -> db = the shared `prisma` client (auto-commit, like no @Transactional)
//   - Called inside a tx   -> db = the `tx` client from prisma.$transaction(async (tx) => ...)
// Passing `tx` makes the query run on the SAME database connection and transaction
// as the other queries in that block, so they commit or roll back together.
// Spring equivalent: repository calls inside a @Transactional service method
// automatically join the current transaction; in Prisma we pass it explicitly.

const prisma = require('../../config/prisma');

const inventoryInclude = {
  product: { select: { id: true, sku: true, name: true, active: true } },
  warehouse: { select: { id: true, name: true, active: true } },
};

const movementInclude = {
  product: { select: { id: true, sku: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  performedBy: { select: { id: true, name: true, email: true } },
};

function inventoryWhere({ productId, warehouseId }) {
  const where = {};
  if (productId !== undefined) where.productId = productId;
  if (warehouseId !== undefined) where.warehouseId = warehouseId;
  return where;
}

function findInventory(filters, { skip, take }) {
  return prisma.inventory.findMany({
    where: inventoryWhere(filters),
    include: inventoryInclude,
    orderBy: [{ productId: 'asc' }, { warehouseId: 'asc' }],
    skip,
    take,
  });
}

function countInventory(filters) {
  return prisma.inventory.count({ where: inventoryWhere(filters) });
}

function findOne(productId, warehouseId, db = prisma) {
  return db.inventory.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
    include: inventoryInclude,
  });
}

// Stock in. upsert = INSERT ... ON CONFLICT (productId, warehouseId)
//                    DO UPDATE SET quantity = quantity + n
// First receipt creates the row; later receipts add to it. One atomic statement.
function incrementStock(productId, warehouseId, quantity, db = prisma) {
  return db.inventory.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    create: { productId, warehouseId, quantity },
    update: { quantity: { increment: quantity } },
    include: inventoryInclude,
  });
}

// Stock out. Conditional update, ONE atomic SQL statement:
//   UPDATE inventory SET quantity = quantity - n
//   WHERE productId = ? AND warehouseId = ? AND quantity >= n
// Returns how many rows changed: 1 = success, 0 = not enough stock (nothing changed).
// The check and the write cannot be separated by another request, so stock can
// never go below zero even when two requests arrive at the same moment.
async function decrementStockIfAvailable(productId, warehouseId, quantity, db = prisma) {
  const result = await db.inventory.updateMany({
    where: { productId, warehouseId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  return result.count === 1;
}

function createMovement(data, db = prisma) {
  return db.stockMovement.create({ data, include: movementInclude });
}

function movementWhere({ productId, warehouseId, type }) {
  const where = inventoryWhere({ productId, warehouseId });
  if (type !== undefined) where.type = type;
  return where;
}

function findMovements(filters, { skip, take }) {
  return prisma.stockMovement.findMany({
    where: movementWhere(filters),
    include: movementInclude,
    orderBy: { id: 'desc' }, // newest first
    skip,
    take,
  });
}

function countMovements(filters) {
  return prisma.stockMovement.count({ where: movementWhere(filters) });
}

module.exports = {
  findInventory,
  countInventory,
  findOne,
  incrementStock,
  decrementStockIfAvailable,
  createMovement,
  findMovements,
  countMovements,
};
