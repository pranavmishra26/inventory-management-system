const inventoryService = require('./inventory.service');

async function list(req, res) {
  res.json(await inventoryService.listInventory(req.query));
}

async function getOne(req, res) {
  const { productId, warehouseId } = req.params;
  res.json({ data: await inventoryService.getInventoryItem(productId, warehouseId) });
}

async function stockIn(req, res) {
  res.status(201).json({ data: await inventoryService.stockIn(req.body, req.user) });
}

async function stockOut(req, res) {
  res.status(201).json({ data: await inventoryService.stockOut(req.body, req.user) });
}

async function movements(req, res) {
  res.json(await inventoryService.listMovements(req.query));
}

module.exports = { list, getOne, stockIn, stockOut, movements };
