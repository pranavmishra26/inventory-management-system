// Spring equivalent: @RequestMapping("/users") on a controller class.
const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { idParamSchema, paginationSchema } = require('../../utils/commonSchemas');
const { changeRoleSchema } = require('./users.schemas');
const controller = require('./users.controller');

const router = Router();

// Every /users route: must be logged in AND be an ADMIN.
router.use(authenticate, authorize('ADMIN'));

router.get('/', validate({ query: paginationSchema }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getById);
router.patch(
  '/:id/role',
  validate({ params: idParamSchema, body: changeRoleSchema }),
  controller.changeRole,
);

module.exports = router;
