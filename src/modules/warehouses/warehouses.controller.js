const warehousesService = require('./warehouses.service');

async function list(req, res) {
  res.json({ data: await warehousesService.listWarehouses(req.query) });
}

async function getById(req, res) {
  res.json({ data: await warehousesService.getWarehouse(req.params.id) });
}

async function create(req, res) {
  res.status(201).json({ data: await warehousesService.createWarehouse(req.body) });
}

async function update(req, res) {
  res.json({ data: await warehousesService.updateWarehouse(req.params.id, req.body) });
}

module.exports = { list, getById, create, update };
