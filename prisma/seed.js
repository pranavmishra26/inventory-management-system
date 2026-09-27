// Seed script: fills an empty database with a known starting dataset.
// Run with:  npx prisma db seed   (also runs automatically after `prisma migrate reset`)
//
// It is safe to run more than once:
//   - users, categories, warehouses and products are upserted by their unique field
//   - opening stock is only added where no inventory row exists yet
//
// Spring equivalent: a CommandLineRunner / data.sql, but run on demand.

const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');

// Local development credentials only. Documented in the README.
const users = [
  { name: 'Admin User', email: 'admin@ims.local', password: 'Admin@12345', role: 'ADMIN' },
  { name: 'Staff User', email: 'staff@ims.local', password: 'Staff@12345', role: 'STAFF' },
  { name: 'Viewer User', email: 'viewer@ims.local', password: 'Viewer@12345', role: 'VIEWER' },
];

const categories = [
  { name: 'Electronics', description: 'Devices and accessories' },
  { name: 'Stationery', description: 'Office and writing supplies' },
  { name: 'Furniture', description: 'Office furniture' },
];

const warehouses = [
  { name: 'Jaipur Central', location: 'Sitapura Industrial Area, Jaipur' },
  { name: 'Delhi North', location: 'Narela Industrial Area, Delhi' },
];

const products = [
  { sku: 'ELEC-MOUSE-001', name: 'Wireless Mouse', price: '799.00', category: 'Electronics' },
  { sku: 'ELEC-KEYB-001', name: 'Mechanical Keyboard', price: '3499.00', category: 'Electronics' },
  { sku: 'ELEC-HDMI-002', name: 'HDMI Cable 2m', price: '349.50', category: 'Electronics' },
  { sku: 'STAT-NOTE-A5', name: 'A5 Notebook (Pack of 5)', price: '250.00', category: 'Stationery' },
  { sku: 'FURN-CHAIR-01', name: 'Ergonomic Office Chair', price: '8999.00', category: 'Furniture' },
  // Inactive on purpose: used later to prove inactive products cannot receive stock.
  { sku: 'FURN-LAMP-OLD', name: 'Legacy Desk Lamp', price: '1200.00', category: 'Furniture', active: false },
];

// Opening stock: [sku, warehouse name, quantity]
const openingStock = [
  ['ELEC-MOUSE-001', 'Jaipur Central', 100],
  ['ELEC-MOUSE-001', 'Delhi North', 50],
  ['ELEC-KEYB-001', 'Jaipur Central', 25],
  ['ELEC-HDMI-002', 'Delhi North', 200],
  ['STAT-NOTE-A5', 'Jaipur Central', 500],
  ['FURN-CHAIR-01', 'Jaipur Central', 5],
];

async function seedUsers() {
  const result = {};
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    // upsert = "INSERT ... ON CONFLICT (email) DO UPDATE": create if missing.
    // `update: {}` means an existing user is left untouched.
    result[u.email] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash, role: u.role },
    });
  }
  return result;
}

async function seedCategories() {
  const result = {};
  for (const c of categories) {
    result[c.name] = await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
  }
  return result;
}

async function seedWarehouses() {
  const result = {};
  for (const w of warehouses) {
    result[w.name] = await prisma.warehouse.upsert({
      where: { name: w.name },
      update: {},
      create: w,
    });
  }
  return result;
}

async function seedProducts(categoryByName) {
  const result = {};
  for (const p of products) {
    result[p.sku] = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        price: p.price,
        active: p.active ?? true,
        categoryId: categoryByName[p.category].id, // sets the foreign-key column
      },
    });
  }
  return result;
}

async function seedOpeningStock(productBySku, warehouseByName, admin) {
  let added = 0;
  for (const [sku, warehouseName, quantity] of openingStock) {
    const productId = productBySku[sku].id;
    const warehouseId = warehouseByName[warehouseName].id;

    // Uses the composite unique key @@unique([productId, warehouseId]).
    const existing = await prisma.inventory.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    if (existing) continue;

    // The stock row and its STOCK_IN history record are written together:
    // either both are saved or neither is (explained fully in Phase 5).
    await prisma.$transaction(async (tx) => {
      await tx.inventory.create({ data: { productId, warehouseId, quantity } });
      await tx.stockMovement.create({
        data: { type: 'STOCK_IN', quantity, productId, warehouseId, performedById: admin.id },
      });
    });
    added += 1;
  }
  return added;
}

async function main() {
  const userByEmail = await seedUsers();
  const categoryByName = await seedCategories();
  const warehouseByName = await seedWarehouses();
  const productBySku = await seedProducts(categoryByName);
  const stockRowsAdded = await seedOpeningStock(
    productBySku,
    warehouseByName,
    userByEmail['admin@ims.local'],
  );

  console.log(
    `Seed complete: ${users.length} users, ${categories.length} categories, ` +
      `${warehouses.length} warehouses, ${products.length} products, ` +
      `${stockRowsAdded} new opening-stock rows.`,
  );
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
