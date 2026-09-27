const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { idParamSchema } = require('../../utils/commonSchemas');
const { createCategorySchema, updateCategorySchema } = require('./categories.schemas');
const controller = require('./categories.controller');

const router = Router();

router.use(authenticate); // any logged-in role can read; writes are ADMIN-only below

router.get('/', controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getById);
router.post('/', authorize('ADMIN'), validate({ body: createCategorySchema }), controller.create);
router.patch(
  '/:id',
  authorize('ADMIN'),
  validate({ params: idParamSchema, body: updateCategorySchema }),
  controller.update,
);

module.exports = router;
