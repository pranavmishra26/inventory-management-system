const AppError = require('../../utils/AppError');
const { toSkipTake, buildMeta } = require('../../utils/pagination');
const categoriesService = require('../categories/categories.service');
const productsRepository = require('./products.repository');

// Prisma returns DECIMAL columns as Decimal objects; send money as a fixed "799.00" string
// so no precision is lost in JSON.
function format(product) {
  return { ...product, price: product.price.toFixed(2) };
}

async function listProducts({ page, limit, ...filters }) {
  const [products, total] = await Promise.all([
    productsRepository.findMany(filters, toSkipTake({ page, limit })),
    productsRepository.count(filters),
  ]);
  return { data: products.map(format), meta: buildMeta({ page, limit }, total) };
}

async function findProductOrThrow(id) {
  const product = await productsRepository.findById(id);
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product ${id} not found`);
  return product;
}

// Used by orders: loads several products and fails if any are missing (404) or inactive (409).
async function findActiveProductsOrThrow(ids) {
  const products = await productsRepository.findByIds(ids);
  const found = new Set(products.map((p) => p.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Some products do not exist', { productIds: missing });
  }
  const inactive = products.filter((p) => !p.active).map((p) => p.sku);
  if (inactive.length > 0) {
    throw new AppError(409, 'PRODUCT_INACTIVE', 'Inactive products cannot be ordered', { skus: inactive });
  }
  return products;
}

async function getProduct(id) {
  return format(await findProductOrThrow(id));
}

async function createProduct(data) {
  await categoriesService.getCategory(data.categoryId); // 404 if the category does not exist
  // A duplicate SKU hits the DB unique constraint -> P2002 -> 409 in errorHandler.
  return format(await productsRepository.create(data));
}

async function updateProduct(id, data) {
  await findProductOrThrow(id);
  if (data.categoryId !== undefined) await categoriesService.getCategory(data.categoryId);
  return format(await productsRepository.update(id, data));
}

// "Delete" is a soft delete: the row stays so inventory, movement and order
// history keep pointing at a real product. Inactive products cannot receive stock.
async function deactivateProduct(id) {
  await findProductOrThrow(id);
  return format(await productsRepository.update(id, { active: false }));
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
  findProductOrThrow,
  findActiveProductsOrThrow,
};
