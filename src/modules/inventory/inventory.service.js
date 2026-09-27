// Inventory business rules.
//
// Rules enforced here:
//   - product and warehouse must exist                     -> 404
//   - inactive products / warehouses cannot RECEIVE stock  -> 409
//   - stock can never go negative                          -> 409 INSUFFICIENT_STOCK
//   - every change writes a StockMovement in the SAME transaction as the quantity change
// (Quantity > 0 is checked by Zod before we get here, and again by DB CHECK constraints.)

const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { toSkipTake, buildMeta } = require('../../utils/pagination');
const productsService = require('../products/products.service');
const warehousesService = require('../warehouses/warehouses.service');
const inventoryRepository = require('./inventory.repository');

async function loadProductAndWarehouse(productId, warehouseId) {
  const [product, warehouse] = await Promise.all([
    productsService.findProductOrThrow(productId), // 404 PRODUCT_NOT_FOUND
    warehousesService.getWarehouse(warehouseId), // 404 WAREHOUSE_NOT_FOUND
  ]);
  return { product, warehouse };
}

async function listInventory({ page, limit, ...filters }) {
  const [rows, total] = await Promise.all([
    inventoryRepository.findInventory(filters, toSkipTake({ page, limit })),
    inventoryRepository.countInventory(filters),
  ]);
  return { data: rows, meta: buildMeta({ page, limit }, total) };
}

async function getInventoryItem(productId, warehouseId) {
  const { product, warehouse } = await loadProductAndWarehouse(productId, warehouseId);
  const row = await inventoryRepository.findOne(productId, warehouseId);
  // Both exist but stock was never received here: that is simply 0 units, not an error.
  return (
    row ?? {
      productId,
      warehouseId,
      quantity: 0,
      product: { id: product.id, sku: product.sku, name: product.name, active: product.active },
      warehouse: { id: warehouse.id, name: warehouse.name, active: warehouse.active },
    }
  );
}

async function stockIn({ productId, warehouseId, quantity }, user) {
  const { product, warehouse } = await loadProductAndWarehouse(productId, warehouseId);

  if (!product.active) {
    throw new AppError(409, 'PRODUCT_INACTIVE', `Product ${product.sku} is inactive and cannot receive stock`);
  }
  if (!warehouse.active) {
    throw new AppError(409, 'WAREHOUSE_INACTIVE', `Warehouse "${warehouse.name}" is inactive and cannot receive stock`);
  }

  // Both writes succeed together or not at all (BEGIN ... COMMIT / ROLLBACK).
  // Without this, a crash between them could leave stock that has no history record.
  return prisma.$transaction(async (tx) => {
    const inventory = await inventoryRepository.incrementStock(productId, warehouseId, quantity, tx);
    const movement = await inventoryRepository.createMovement(
      { type: 'STOCK_IN', quantity, productId, warehouseId, performedById: user.id },
      tx,
    );
    return { inventory, movement };
  });
}

// Removing stock from an inactive product/warehouse IS allowed (e.g. clearing out old stock).
async function stockOut({ productId, warehouseId, quantity }, user) {
  await loadProductAndWarehouse(productId, warehouseId);

  return prisma.$transaction(async (tx) => {
    const ok = await inventoryRepository.decrementStockIfAvailable(productId, warehouseId, quantity, tx);
    if (!ok) {
      const current = await inventoryRepository.findOne(productId, warehouseId, tx);
      // Throwing inside $transaction rolls it back; errorHandler turns it into a 409.
      throw new AppError(409, 'INSUFFICIENT_STOCK', 'Not enough stock to remove', {
        productId,
        warehouseId,
        requested: quantity,
        available: current ? current.quantity : 0,
      });
    }
    const movement = await inventoryRepository.createMovement(
      { type: 'STOCK_OUT', quantity, productId, warehouseId, performedById: user.id },
      tx,
    );
    const inventory = await inventoryRepository.findOne(productId, warehouseId, tx);
    return { inventory, movement };
  });
}

async function listMovements({ page, limit, ...filters }) {
  const [rows, total] = await Promise.all([
    inventoryRepository.findMovements(filters, toSkipTake({ page, limit })),
    inventoryRepository.countMovements(filters),
  ]);
  return { data: rows, meta: buildMeta({ page, limit }, total) };
}

module.exports = { listInventory, getInventoryItem, stockIn, stockOut, listMovements };
