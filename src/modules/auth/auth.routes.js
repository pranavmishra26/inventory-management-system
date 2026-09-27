const { Router } = require('express');
const validate = require('../../middleware/validate');
const { registerSchema, loginSchema } = require('./auth.schemas');
const controller = require('./auth.controller');

const router = Router();

// Public routes: no authenticate middleware.
router.post('/register', validate({ body: registerSchema }), controller.register);
router.post('/login', validate({ body: loginSchema }), controller.login);

module.exports = router;
