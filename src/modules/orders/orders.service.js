// Order business rules.
//
// Lifecycle:  PENDING --confirm--> CONFIRMED --dispatch--> DISPATCHED
//   - Creating an order does NOT touch stock (a PENDING order reserves nothing).
//   - Confirming checks stock, deducts it and writes STOCK_OUT movements - all in ONE transaction.
//   - Dispatching is a status change only (stock already left inventory at confirmation).

const crypto = require('node:crypto');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { toSkipTake, buildMeta } = require('../../utils/pagination');
const warehousesService = require('../warehouses/warehouses.service');
const productsService = require('../products/products.service');
// Used directly (not via inventory.service) because confirmation must run the stock
// queries on OUR transaction client `tx`, alongside the order status change.
const inventoryRepository = require('../inventory/inventory.repository');
const ordersRepository = require('./orders.repository');

// The state machine: which status an order must be in to move to the target status.
const REQUIRED_PREVIOUS_STATUS = {
  CONFIRMED: 'PENDING',
  DISPATCHED: 'CONFIRMED',
};

// e.g. ORD-20260927-4F7K2Q  (unique constraint in the DB guards against the tiny collision chance)
function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${date}-${random}`;
}

async function getOrder(id, db) {
  const order = await ordersRepository.findById(id, db);
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', `Order ${id} not found`);
  return order;
}

async function listOrders({ page, limit, status }) {
  const [orders, total] = await Promise.all([
    ordersRepository.findMany({ status }, toSkipTake({ page, limit })),
    ordersRepository.count({ status }),
  ]);
  return { data: orders, meta: buildMeta({ page, limit }, total) };
}

async function createOrder({ warehouseId, items }, user) {
  const warehouse = await warehousesService.getWarehouse(warehouseId); // 404 if missing
  if (!warehouse.active) {
    throw new AppError(409, 'WAREHOUSE_INACTIVE', `Warehouse "${warehouse.name}" is inactive`);
  }

  await productsService.findActiveProductsOrThrow(items.map((item) => item.productId));

  return ordersRepository.createWithItems({
    orderNumber: generateOrderNumber(),
    warehouseId,
    createdById: user.id,
    items,
  });
}

// Moves an order to `to`, but only if it is currently in the required previous status.
async function transitionStatus(id, to, db) {
  const from = REQUIRED_PREVIOUS_STATUS[to];
  const moved = await ordersRepository.updateStatusIf(id, from, to, db);
  if (!moved) {
    const order = await getOrder(id, db); // 404 if it does not exist at all
    throw new AppError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Cannot change order from ${order.status} to ${to} (must be ${from})`,
    );
  }
}

// THE core flow. Everything inside $transaction commits together or rolls back together:
//   BEGIN
//     1. PENDING -> CONFIRMED (conditional update, so it can only happen once)
//     2. check every item's stock; if anything is short -> throw -> ROLLBACK
//     3. for each item: conditional stock decrement + STOCK_OUT movement linked to the order
//   COMMIT
async function confirmOrder(id, user) {
  await prisma.$transaction(async (tx) => {
    await transitionStatus(id, 'CONFIRMED', tx);

    const order = await getOrder(id, tx);
    // Items come back sorted by productId (see orders.repository). Two orders that share
    // products therefore lock inventory rows in the same order, which avoids deadlocks.
    const { items } = order;

    // Step 2: check all items first so the error can list every shortage at once.
    const shortages = [];
    for (const item of items) {
      const stock = await inventoryRepository.findOne(item.productId, order.warehouseId, tx);
      const available = stock ? stock.quantity : 0;
      if (available < item.quantity) {
        shortages.push({ productId: item.productId, sku: item.product.sku, requested: item.quantity, available });
      }
    }
    if (shortages.length > 0) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', 'Not enough stock to confirm this order', shortages);
    }

    // Step 3: deduct + record. The conditional decrement is the real guarantee: if another
    // request took the stock between step 2 and now, it returns false and we roll back.
    for (const item of items) {
      const ok = await inventoryRepository.decrementStockIfAvailable(
        item.productId,
        order.warehouseId,
        item.quantity,
        tx,
      );
      if (!ok) {
        throw new AppError(409, 'INSUFFICIENT_STOCK', 'Stock changed while confirming; please retry', [
          { productId: item.productId, sku: item.product.sku, requested: item.quantity },
        ]);
      }
      await inventoryRepository.createMovement(
        {
          type: 'STOCK_OUT',
          quantity: item.quantity,
          productId: item.productId,
          warehouseId: order.warehouseId,
          performedById: user.id,
          orderId: order.id,
        },
        tx,
      );
    }
  });

  return getOrder(id); // read the committed result
}

async function dispatchOrder(id) {
  await transitionStatus(id, 'DISPATCHED'); // single atomic statement, no transaction needed
  return getOrder(id);
}

module.exports = { listOrders, getOrder, createOrder, confirmOrder, dispatchOrder };
