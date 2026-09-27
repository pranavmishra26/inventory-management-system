const ordersService = require('./orders.service');

async function list(req, res) {
  res.json(await ordersService.listOrders(req.query));
}

async function getById(req, res) {
  res.json({ data: await ordersService.getOrder(req.params.id) });
}

async function create(req, res) {
  res.status(201).json({ data: await ordersService.createOrder(req.body, req.user) });
}

async function confirm(req, res) {
  res.json({ data: await ordersService.confirmOrder(req.params.id, req.user) });
}

async function dispatch(req, res) {
  res.json({ data: await ordersService.dispatchOrder(req.params.id) });
}

module.exports = { list, getById, create, confirm, dispatch };
