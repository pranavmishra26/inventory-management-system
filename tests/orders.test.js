const { app, prisma, request, resetDb, createUserAndLogin, auth } = require('./helpers');
const inventoryRepository = require('../src/modules/inventory/inventory.repository');

let admin;
let staff;
let viewer;
let mouse;
let keyboard;
let jaipur;

beforeEach(async () => {
  await resetDb();
  admin = await createUserAndLogin('ADMIN');
  staff = await createUserAndLogin('STAFF');
  viewer = await createUserAndLogin('VIEWER');
  const category = await prisma.category.create({ data: { name: 'Electronics' } });
  mouse = await prisma.product.create({ data: { sku: 'MOUSE', name: 'Mouse', price: 799, categoryId: category.id } });
  keyboard = await prisma.product.create({ data: { sku: 'KEYB', name: 'Keyboard', price: 3499, categoryId: category.id } });
  jaipur = await prisma.warehouse.create({ data: { name: 'Jaipur', location: 'Jaipur' } });
  await prisma.inventory.createMany({
    data: [
      { productId: mouse.id, warehouseId: jaipur.id, quantity: 10 },
      { productId: keyboard.id, warehouseId: jaipur.id, quantity: 3 },
    ],
  });
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => prisma.$disconnect());

const createOrder = (token, items, warehouseId = jaipur.id) =>
  request(app).post('/orders').set(auth(token)).send({ warehouseId, items });
const confirm = (token, id) => request(app).post(`/orders/${id}/confirm`).set(auth(token));
const dispatch = (token, id) => request(app).post(`/orders/${id}/dispatch`).set(auth(token));
const stockOf = async (product) =>
  (await prisma.inventory.findUnique({
    where: { productId_warehouseId: { productId: product.id, warehouseId: jaipur.id } },
  })).quantity;
const outMovements = () => prisma.stockMovement.findMany({ where: { type: 'STOCK_OUT' } });

describe('Creating orders', () => {
  test('creates a PENDING order with items and does not touch stock', async () => {
    const res = await createOrder(staff.token, [
      { productId: mouse.id, quantity: 2 },
      { productId: keyboard.id, quantity: 1 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.orderNumber).toMatch(/^ORD-\d{8}-[0-9A-F]{6}$/);
    expect(res.body.data.createdBy.id).toBe(staff.user.id);
    expect(res.body.data.items.map((i) => [i.product.sku, i.quantity])).toEqual([['MOUSE', 2], ['KEYB', 1]]);
    expect(await stockOf(mouse)).toBe(10);
    expect(await outMovements()).toHaveLength(0);
  });

  test('validation: no items, duplicate product, zero quantity -> 400', async () => {
    const empty = await createOrder(staff.token, []);
    const dup = await createOrder(staff.token, [
      { productId: mouse.id, quantity: 1 },
      { productId: mouse.id, quantity: 2 },
    ]);
    const zero = await createOrder(staff.token, [{ productId: mouse.id, quantity: 0 }]);
    expect([empty.status, dup.status, zero.status]).toEqual([400, 400, 400]);
    expect(await prisma.order.count()).toBe(0);
  });

  test('unknown product / warehouse -> 404; inactive product / warehouse -> 409', async () => {
    const noProduct = await createOrder(staff.token, [{ productId: 999, quantity: 1 }]);
    expect([noProduct.status, noProduct.body.error.details.productIds]).toEqual([404, [999]]);
    expect((await createOrder(staff.token, [{ productId: mouse.id, quantity: 1 }], 999)).status).toBe(404);

    await prisma.product.update({ where: { id: keyboard.id }, data: { active: false } });
    const inactiveProduct = await createOrder(staff.token, [{ productId: keyboard.id, quantity: 1 }]);
    expect([inactiveProduct.status, inactiveProduct.body.error.code]).toEqual([409, 'PRODUCT_INACTIVE']);

    await prisma.warehouse.update({ where: { id: jaipur.id }, data: { active: false } });
    const inactiveWh = await createOrder(staff.token, [{ productId: mouse.id, quantity: 1 }]);
    expect([inactiveWh.status, inactiveWh.body.error.code]).toEqual([409, 'WAREHOUSE_INACTIVE']);
    expect(await prisma.order.count()).toBe(0);
  });

  test('VIEWER cannot create, list or confirm orders (403)', async () => {
    const order = await createOrder(staff.token, [{ productId: mouse.id, quantity: 1 }]);
    expect((await createOrder(viewer.token, [{ productId: mouse.id, quantity: 1 }])).status).toBe(403);
    expect((await request(app).get('/orders').set(auth(viewer.token))).status).toBe(403);
    expect((await confirm(viewer.token, order.body.data.id)).status).toBe(403);
    expect((await request(app).post('/orders').send({})).status).toBe(401);
  });
});

describe('Confirming orders (order -> inventory)', () => {
  test('success: deducts stock, writes STOCK_OUT movements linked to the order, status CONFIRMED', async () => {
    const order = (await createOrder(staff.token, [
      { productId: mouse.id, quantity: 4 },
      { productId: keyboard.id, quantity: 3 },
    ])).body.data;

    const res = await confirm(staff.token, order.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.stockMovements).toHaveLength(2);

    expect(await stockOf(mouse)).toBe(6);
    expect(await stockOf(keyboard)).toBe(0);
    const outs = await outMovements();
    expect(outs.map((m) => [m.productId, m.quantity, m.orderId, m.performedById])).toEqual(
      expect.arrayContaining([
        [mouse.id, 4, order.id, staff.user.id],
        [keyboard.id, 3, order.id, staff.user.id],
      ]),
    );
  });

  test('insufficient stock: 409 listing every short item, NOTHING changes', async () => {
    const order = (await createOrder(staff.token, [
      { productId: mouse.id, quantity: 5 }, // enough (10)
      { productId: keyboard.id, quantity: 4 }, // short (3)
    ])).body.data;

    const res = await confirm(staff.token, order.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toEqual([{ productId: keyboard.id, sku: 'KEYB', requested: 4, available: 3 }]);

    expect(await stockOf(mouse)).toBe(10); // the mouse was NOT deducted
    expect(await stockOf(keyboard)).toBe(3);
    expect(await outMovements()).toHaveLength(0);
    expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING'); // status rolled back
  });

  test('a failure half-way through rolls back the earlier deduction and the status change', async () => {
    const order = (await createOrder(staff.token, [
      { productId: mouse.id, quantity: 2 },
      { productId: keyboard.id, quantity: 1 },
    ])).body.data;

    jest.spyOn(console, 'error').mockImplementation(() => {}); // expected 500 is logged; keep output clean
    // Let the first STOCK_OUT movement be written, then fail on the second one.
    const real = inventoryRepository.createMovement;
    let calls = 0;
    jest.spyOn(inventoryRepository, 'createMovement').mockImplementation((data, db) => {
      calls += 1;
      if (calls === 2) throw new Error('simulated database failure');
      return real(data, db);
    });

    const res = await confirm(staff.token, order.id);
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Something went wrong'); // no internals leaked

    expect(await stockOf(mouse)).toBe(10); // mouse deduction was undone
    expect(await stockOf(keyboard)).toBe(3);
    expect(await outMovements()).toHaveLength(0); // first movement was undone
    expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('PENDING');
  });

  test('two orders competing for the same stock: only one can be confirmed', async () => {
    const a = (await createOrder(staff.token, [{ productId: mouse.id, quantity: 7 }])).body.data;
    const b = (await createOrder(admin.token, [{ productId: mouse.id, quantity: 7 }])).body.data;

    const results = await Promise.all([confirm(staff.token, a.id), confirm(admin.token, b.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stockOf(mouse)).toBe(3);
    expect(await outMovements()).toHaveLength(1);
  });

  test('the same order confirmed 5 times at once is deducted exactly once', async () => {
    const order = (await createOrder(staff.token, [{ productId: mouse.id, quantity: 2 }])).body.data;
    const results = await Promise.all(Array.from({ length: 5 }, () => confirm(staff.token, order.id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await stockOf(mouse)).toBe(8);
    expect(await outMovements()).toHaveLength(1);
  });
});

describe('Status workflow', () => {
  test('PENDING -> CONFIRMED -> DISPATCHED, and every invalid transition is rejected', async () => {
    const order = (await createOrder(staff.token, [{ productId: mouse.id, quantity: 1 }])).body.data;

    const early = await dispatch(staff.token, order.id); // PENDING -> DISPATCHED not allowed
    expect([early.status, early.body.error.code]).toEqual([409, 'INVALID_STATUS_TRANSITION']);

    expect((await confirm(staff.token, order.id)).status).toBe(200);
    expect((await confirm(staff.token, order.id)).status).toBe(409); // already confirmed

    const shipped = await dispatch(staff.token, order.id);
    expect([shipped.status, shipped.body.data.status]).toEqual([200, 'DISPATCHED']);
    expect(await stockOf(mouse)).toBe(9); // dispatch does not deduct again

    expect((await dispatch(staff.token, order.id)).status).toBe(409);
    expect((await confirm(staff.token, order.id)).status).toBe(409);
  });

  test('unknown order -> 404; list filters by status and paginates', async () => {
    expect((await confirm(staff.token, 999)).status).toBe(404);
    expect((await dispatch(staff.token, 999)).status).toBe(404);
    expect((await request(app).get('/orders/999').set(auth(staff.token))).status).toBe(404);

    const a = (await createOrder(staff.token, [{ productId: mouse.id, quantity: 1 }])).body.data;
    await createOrder(staff.token, [{ productId: mouse.id, quantity: 1 }]);
    await confirm(staff.token, a.id);

    const pending = await request(app).get('/orders?status=PENDING').set(auth(staff.token));
    expect(pending.body.data).toHaveLength(1);
    const all = await request(app).get('/orders?limit=1').set(auth(admin.token));
    expect(all.body.meta).toMatchObject({ total: 2, totalPages: 2 });
    const bad = await request(app).get('/orders?status=SHIPPED').set(auth(admin.token));
    expect(bad.status).toBe(400);
  });
});

describe('Inventory invariant across the whole app', () => {
  test('after mixed stock-ins, stock-outs and orders, stock == sum(IN) - sum(OUT) and never < 0', async () => {
    await prisma.inventory.deleteMany(); // start from movements only
    const w = jaipur.id;
    await request(app).post('/stock/in').set(auth(staff.token)).send({ productId: mouse.id, warehouseId: w, quantity: 20 });
    await request(app).post('/stock/in').set(auth(staff.token)).send({ productId: keyboard.id, warehouseId: w, quantity: 5 });
    await request(app).post('/stock/out').set(auth(staff.token)).send({ productId: mouse.id, warehouseId: w, quantity: 3 });
    const o1 = (await createOrder(staff.token, [{ productId: mouse.id, quantity: 10 }, { productId: keyboard.id, quantity: 5 }])).body.data;
    const o2 = (await createOrder(staff.token, [{ productId: mouse.id, quantity: 10 }])).body.data;
    await confirm(staff.token, o1.id); // succeeds
    await confirm(staff.token, o2.id); // fails: only 7 mice left

    const rows = await prisma.$queryRaw`
      SELECT i.quantity::int AS quantity,
             COALESCE(SUM(CASE WHEN m.type = 'STOCK_IN' THEN m.quantity ELSE -m.quantity END), 0)::int AS net
      FROM inventory i
      LEFT JOIN stock_movements m ON m."productId" = i."productId" AND m."warehouseId" = i."warehouseId"
      GROUP BY i.id, i.quantity`;
    for (const row of rows) {
      expect(row.quantity).toBe(row.net);
      expect(row.quantity).toBeGreaterThanOrEqual(0);
    }
    expect(await stockOf(mouse)).toBe(7);
    expect(await stockOf(keyboard)).toBe(0);
  });
});
