const AppError = require('../../utils/AppError');
const categoriesRepository = require('./categories.repository');

function listCategories() {
  return categoriesRepository.findAll();
}

async function getCategory(id) {
  const category = await categoriesRepository.findById(id);
  if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', `Category ${id} not found`);
  return category;
}

// Duplicate names are caught by the DB unique constraint -> P2002 -> 409 in errorHandler.
function createCategory(data) {
  return categoriesRepository.create(data);
}

async function updateCategory(id, data) {
  await getCategory(id);
  return categoriesRepository.update(id, data);
}

module.exports = { listCategories, getCategory, createCategory, updateCategory };
