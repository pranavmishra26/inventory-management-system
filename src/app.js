// Builds and configures the Express application (but does NOT start listening).
// Keeping this separate from server.js lets tests import the app directly.

const express = require('express');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const categoriesRoutes = require('./modules/categories/categories.routes');
const productsRoutes = require('./modules/products/products.routes');
const warehousesRoutes = require('./modules/warehouses/warehouses.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const stockRoutes = require('./modules/inventory/stock.routes');
const ordersRoutes = require('./modules/orders/orders.routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by'); // don't advertise the framework in response headers

// Middleware runs in the order it is registered, for every request.
app.use(express.json()); // parses JSON request bodies into req.body

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Feature routers. Spring equivalent: each @RestController's @RequestMapping prefix.
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/categories', categoriesRoutes);
app.use('/products', productsRoutes);
app.use('/warehouses', warehousesRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/stock', stockRoutes);
app.use('/orders', ordersRoutes);

// These two must stay LAST: unmatched routes, then errors.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
