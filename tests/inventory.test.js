const { app, prisma, request, resetDb, createUserAndLogin, auth } = require('./helpers');
const inventoryService = require('../src/modules/inventory/inventory.service');

let admin;
let staff;
let viewer;
let product;
let warehouse;

beforeEach(async () => {
  await resetDb();
  admin = await createUserAndLogin('ADMIN');
  staff = await createUserAndLogin('STAFF');
  viewer = await createUserAndLogin('VIEWER');
  const category = await prisma.category.create({ data: { name: 'Electronics' } });
  product = await prisma.product.create({
    data: { sku: 'MOUSE-1', name: 'Mouse', price: 799, categoryId: category.id },
  });
  warehouse = await prisma.warehouse.create({ data: { name: 'Jaipur', location: 'Jaipur' } });
});
afterAll(() => prisma.$disconnect());

const stockIn = (token, body) => request(app).post('/stock/in').set(auth(token)).send(body);
const stockOut = (token, body) => request(app).post('/stock/out').set(auth(token)).send(body);
const qty = async () =>
  (await prisma.inventory.findUnique({
    where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
  }))?.quantity ?? 0;
const movements = () => prisma.stockMovement.findMany({ orderBy: { id: 'asc' } });

describe('Stock in', () => {
  test('creates the inventory row + a STOCK_IN movement linked to the user', async () => {
    const res = await stockIn(staff.token, { productId: product.id, warehouseId: warehouse.id, quantity: 100 });
    expect(res.status).toBe(201);
    expect(res.body.data.inventory.quantity).toBe(100);
    expect(res.body.data.movement).toMatchObject({ type: 'STOCK_IN', quantity: 100, performedBy: { id: staff.user.id } });
    expect(await movements()).toHaveLength(1);
  });

  test('a second receipt adds to the same row (upsert)', async () => {
    const body = { productId: product.id, warehouseId: warehouse.id, quantity: 100 };
    await stockIn(staff.token, body);
    await stockIn(staff.token, { ...body, quantity: 50 });
    expect(await qty()).toBe(150);
    expect(await prisma.inventory.count()).toBe(1);
    expect(await movements()).toHaveLength(2);
  });

  test('inactive product -> 409, nothing written', async () => {
    await prisma.product.update({ where: { id: product.id }, data: { active: false } });
    const res = await stockIn(staff.token, { productId: product.id, warehouseId: warehouse.id, quantity: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_INACTIVE');
    expect(await qty()).toBe(0);
    expect(await movements()).toHaveLength(0);
  });

  test('inactive warehouse -> 409, nothing written', async () => {
    await prisma.warehouse.update({ where: { id: warehouse.id }, data: { active: false } });
    const res = await stockIn(staff.token, { productId: product.id, warehouseId: warehouse.id, quantity: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WAREHOUSE_INACTIVE');
    expect(await movements()).toHaveLength(0);
  });

  test('unknown product / warehouse -> 404', async () => {
    const p = await stockIn(staff.token, { productId: 999, warehouseId: warehouse.id, quantity: 5 });
    const w = await stockIn(staff.token, { productId: product.id, warehouseId: 999, quantity: 5 });
    expect([p.status, p.body.error.code]).toEqual([404, 'PRODUCT_NOT_FOUND']);
    expect([w.status, w.body.error.code]).toEqual([404, 'WAREHOUSE_NOT_FOUND']);
  });

  test('quantity must be a positive whole number -> 400', async () => {
    for (const quantity of [0, -5, 2.5, '10']) {
      const res = await stockIn(staff.token, { productId: product.id, warehouseId: warehouse.id, quantity });
      expect(res.status).toBe(400);
    }
    expect(await movements()).toHaveLength(0);
  });

  test('if the movement insert fails, the stock increase is rolled back', async () => {
    // A user id that does not exist makes the STOCK_IN movement insert fail (FK violation)
    // AFTER the inventory upsert already ran inside the same transaction.
    await expect(
      inventoryService.stockIn(
        { productId: product.id, warehouseId: warehouse.id, quantity: 40 },
        { id: 999999 },
      ),
    ).rejects.toThrow();
    expect(await qty()).toBe(0); // the upsert was undone
    expect(await prisma.inventory.count()).toBe(0);
  });
});

describe('Stock out', () => {
  beforeEach(async () => {
    await stockIn(admin.token, { productId: product.id, warehouseId: warehouse.id, quantity: 20 });
  });

  test('removes stock and records a STOCK_OUT movement', async () => {
    const res = await stockOut(staff.token, { productId: product.id, warehouseId: warehouse.id, quantity: 8 });
    expect(res.status).toBe(201);
    expect(res.body.data.inventory.quantity).toBe(12);
    expect(res.body.data.movement).toMatchObject({ type: 'STOCK_OUT', quantity: 8 });
  });

  test('cannot go negative: 409 with requested/available, nothing changes', async () => {
    const res = await stockOut(staff.token, { productId: product.id, warehouseId: warehouse.id, quantity: 21 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toMatchObject({ requested: 21, available: 20 });
    expect(await qty()).toBe(20);
    expect(await movements()).toHaveLength(1); // only the original STOCK_IN
  });

  test('can remove down to exactly 0', async () => {
    const res = await stockOut(staff.token, { productId: product.id, warehouseId: warehouse.id, quantity: 20 });
    expect(res.status).toBe(201);
    expect(await qty()).toBe(0);
  });

  test('no inventory row in that warehouse -> 409 with available 0', async () => {
    const other = await prisma.warehouse.create({ data: { name: 'Delhi', location: 'Delhi' } });
    const res = await stockOut(staff.token, { productId: product.id, warehouseId: other.id, quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.details.available).toBe(0);
  });

  test('10 simultaneous removals of 3 units from 20: exactly 6 succeed, stock ends at 2', async () => {
    const body = { productId: product.id, warehouseId: warehouse.id, quantity: 3 };
    const results = await Promise.all(Array.from({ length: 10 }, () => stockOut(staff.token, body)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(6);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    expect(await qty()).toBe(2);
    const outs = (await movements()).filter((m) => m.type === 'STOCK_OUT');
    expect(outs).toHaveLength(6); // one movement per successful removal, none for failures
  });
});

describe('Roles, reads and history', () => {
  test('VIEWER can read inventory but cannot change stock or see movements', async () => {
    await stockIn(admin.token, { productId: product.id, warehouseId: warehouse.id, quantity: 5 });
    expect((await request(app).get('/inventory').set(auth(viewer.token))).status).toBe(200);
    expect((await stockIn(viewer.token, { productId: product.id, warehouseId: warehouse.id, quantity: 1 })).status).toBe(403);
    expect((await stockOut(viewer.token, { productId: product.id, warehouseId: warehouse.id, quantity: 1 })).status).toBe(403);
    expect((await request(app).get('/stock/movements').set(auth(viewer.token))).status).toBe(403);
  });

  test('inventory across warehouses, single item, and 0 for a never-stocked pair', async () => {
    const delhi = await prisma.warehouse.create({ data: { name: 'Delhi', location: 'Delhi' } });
    const mumbai = await prisma.warehouse.create({ data: { name: 'Mumbai', location: 'Mumbai' } });
    await stockIn(admin.token, { productId: product.id, warehouseId: warehouse.id, quantity: 100 });
    await stockIn(admin.token, { productId: product.id, warehouseId: delhi.id, quantity: 50 });

    const across = await request(app).get(`/inventory?productId=${product.id}`).set(auth(viewer.token));
    expect(across.body.data.map((r) => [r.warehouse.name, r.quantity])).toEqual([['Jaipur', 100], ['Delhi', 50]]);

    const one = await request(app).get(`/inventory/${product.id}/${delhi.id}`).set(auth(viewer.token));
    expect(one.body.data.quantity).toBe(50);

    const none = await request(app).get(`/inventory/${product.id}/${mumbai.id}`).set(auth(viewer.token));
    expect([none.status, none.body.data.quantity]).toEqual([200, 0]);

    const bad = await request(app).get(`/inventory/999/${delhi.id}`).set(auth(viewer.token));
    expect(bad.status).toBe(404);
  });

  test('movement history: newest first, filter by type, paginated', async () => {
    const body = { productId: product.id, warehouseId: warehouse.id };
    await stockIn(admin.token, { ...body, quantity: 10 });
    await stockOut(staff.token, { ...body, quantity: 3 });
    await stockIn(staff.token, { ...body, quantity: 7 });

    const all = await request(app).get('/stock/movements').set(auth(staff.token));
    expect(all.body.data.map((m) => `${m.type}:${m.quantity}`)).toEqual(['STOCK_IN:7', 'STOCK_OUT:3', 'STOCK_IN:10']);
    expect(all.body.data[1].performedBy.email).toBe(staff.user.email);

    const outs = await request(app).get('/stock/movements?type=STOCK_OUT').set(auth(staff.token));
    expect(outs.body.data).toHaveLength(1);

    const page = await request(app).get('/stock/movements?limit=2&page=2').set(auth(staff.token));
    expect(page.body.meta).toMatchObject({ total: 3, totalPages: 2 });
    expect(page.body.data).toHaveLength(1);
  });
});
