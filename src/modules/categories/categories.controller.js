const categoriesService = require('./categories.service');

async function list(req, res) {
  res.json({ data: await categoriesService.listCategories() });
}

async function getById(req, res) {
  res.json({ data: await categoriesService.getCategory(req.params.id) });
}

async function create(req, res) {
  res.status(201).json({ data: await categoriesService.createCategory(req.body) });
}

async function update(req, res) {
  res.json({ data: await categoriesService.updateCategory(req.params.id, req.body) });
}

module.exports = { list, getById, create, update };
