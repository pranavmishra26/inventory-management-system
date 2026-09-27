const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { idParamSchema } = require('../../utils/commonSchemas');
const { createOrderSchema, listOrdersQuery } = require('./orders.schemas');
const controller = require('./orders.controller');

const router = Router();

router.use(authenticate, authorize('ADMIN', 'STAFF')); // VIEWER has no access to orders

router.post('/', validate({ body: createOrderSchema }), controller.create);
router.get('/', validate({ query: listOrdersQuery }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getById);
router.post('/:id/confirm', validate({ params: idParamSchema }), controller.confirm);
router.post('/:id/dispatch', validate({ params: idParamSchema }), controller.dispatch);

module.exports = router;
