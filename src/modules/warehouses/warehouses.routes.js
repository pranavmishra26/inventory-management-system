const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { idParamSchema } = require('../../utils/commonSchemas');
const {
  createWarehouseSchema,
  updateWarehouseSchema,
  listWarehousesQuery,
} = require('./warehouses.schemas');
const controller = require('./warehouses.controller');

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listWarehousesQuery }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getById);
router.post('/', authorize('ADMIN'), validate({ body: createWarehouseSchema }), controller.create);
router.patch(
  '/:id',
  authorize('ADMIN'),
  validate({ params: idParamSchema, body: updateWarehouseSchema }),
  controller.update,
);

module.exports = router;
