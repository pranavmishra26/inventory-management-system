// /inventory - read-only views of current stock. Every logged-in role can read.
const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const { inventoryListQuery, inventoryItemParams } = require('./inventory.schemas');
const controller = require('./inventory.controller');

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: inventoryListQuery }), controller.list);
router.get('/:productId/:warehouseId', validate({ params: inventoryItemParams }), controller.getOne);

module.exports = router;
