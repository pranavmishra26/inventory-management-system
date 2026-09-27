const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { idParamSchema } = require('../../utils/commonSchemas');
const {
  createProductSchema,
  updateProductSchema,
  listProductsQuery,
} = require('./products.schemas');
const controller = require('./products.controller');

const router = Router();

router.use(authenticate); // ADMIN, STAFF and VIEWER can all read products

router.get('/', validate({ query: listProductsQuery }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getById);
router.post('/', authorize('ADMIN'), validate({ body: createProductSchema }), controller.create);
router.patch(
  '/:id',
  authorize('ADMIN'),
  validate({ params: idParamSchema, body: updateProductSchema }),
  controller.update,
);
router.delete('/:id', authorize('ADMIN'), validate({ params: idParamSchema }), controller.deactivate);

module.exports = router;
