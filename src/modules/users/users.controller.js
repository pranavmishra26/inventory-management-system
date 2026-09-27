// Controllers: read the request, call the service, send the response. Nothing else.
// Spring equivalent: @RestController methods.

const usersService = require('./users.service');

async function list(req, res) {
  const result = await usersService.listUsers(req.query);
  res.json(result);
}

async function getById(req, res) {
  const user = await usersService.getUser(req.params.id);
  res.json({ data: user });
}

async function changeRole(req, res) {
  const user = await usersService.changeRole(req.params.id, req.body.role, req.user);
  res.json({ data: user });
}

module.exports = { list, getById, changeRole };
