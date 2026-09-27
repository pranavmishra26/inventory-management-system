const AppError = require('../../utils/AppError');
const warehousesRepository = require('./warehouses.repository');

function listWarehouses(filters) {
  return warehousesRepository.findAll(filters);
}

async function getWarehouse(id) {
  const warehouse = await warehousesRepository.findById(id);
  if (!warehouse) throw new AppError(404, 'WAREHOUSE_NOT_FOUND', `Warehouse ${id} not found`);
  return warehouse;
}

function createWarehouse(data) {
  return warehousesRepository.create(data);
}

// Deactivation is just PATCH { active: false }. Rows are never deleted, so
// stock movement and order history that reference this warehouse stay valid.
async function updateWarehouse(id, data) {
  await getWarehouse(id);
  return warehousesRepository.update(id, data);
}

module.exports = { listWarehouses, getWarehouse, createWarehouse, updateWarehouse };
