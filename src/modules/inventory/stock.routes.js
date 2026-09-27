// /stock - changing stock and viewing its history. ADMIN and STAFF only.
const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { stockChangeSchema, movementsQuery } = require('./inventory.schemas');
const controller = require('./inventory.controller');

const router = Router();

router.use(authenticate, authorize('ADMIN', 'STAFF'));

router.post('/in', validate({ body: stockChangeSchema }), controller.stockIn);
router.post('/out', validate({ body: stockChangeSchema }), controller.stockOut);
router.get('/movements', validate({ query: movementsQuery }), controller.movements);

module.exports = router;
