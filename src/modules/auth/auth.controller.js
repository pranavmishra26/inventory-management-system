const authService = require('./auth.service');

async function register(req, res) {
  const user = await authService.register(req.body);
  res.status(201).json({ data: user });
}

async function login(req, res) {
  const result = await authService.login(req.body);
  res.json({ data: result });
}

module.exports = { register, login };
