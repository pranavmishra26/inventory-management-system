const productsService = require('./products.service');

async function list(req, res) {
  res.json(await productsService.listProducts(req.query));
}

async function getById(req, res) {
  res.json({ data: await productsService.getProduct(req.params.id) });
}

async function create(req, res) {
  res.status(201).json({ data: await productsService.createProduct(req.body) });
}

async function update(req, res) {
  res.json({ data: await productsService.updateProduct(req.params.id, req.body) });
}

async function deactivate(req, res) {
  res.json({ data: await productsService.deactivateProduct(req.params.id) });
}

module.exports = { list, getById, create, update, deactivate };
