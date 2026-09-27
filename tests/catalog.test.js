const { app, prisma, request, resetDb, createUserAndLogin, auth } = require('./helpers');

let admin;
let viewer;
let category;

beforeEach(async () => {
  await resetDb();
  admin = await createUserAndLogin('ADMIN');
  viewer = await createUserAndLogin('VIEWER');
  category = await prisma.category.create({ data: { name: 'Electronics' } });
});
afterAll(() => prisma.$disconnect());

const newProduct = () => ({ sku: 'mouse-1', name: 'Wireless Mouse', price: 799, categoryId: category.id });

describe('Products', () => {
  test('ADMIN creates a product (SKU normalised, price as "799.00", category included)', async () => {
    const res = await request(app).post('/products').set(auth(admin.token)).send(newProduct());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      sku: 'MOUSE-1',
      price: '799.00',
      active: true,
      category: { id: category.id, name: 'Electronics' },
    });
  });

  test('duplicate SKU -> 409', async () => {
    await request(app).post('/products').set(auth(admin.token)).send(newProduct());
    const res = await request(app).post('/products').set(auth(admin.token)).send(newProduct());
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('sku');
  });

  test('price <= 0, missing SKU, 3 decimals -> 400', async () => {
    const zero = await request(app).post('/products').set(auth(admin.token)).send({ ...newProduct(), price: 0 });
    const noSku = await request(app).post('/products').set(auth(admin.token)).send({ ...newProduct(), sku: '' });
    const decimals = await request(app).post('/products').set(auth(admin.token)).send({ ...newProduct(), price: 1.005 });
    expect([zero.status, noSku.status, decimals.status]).toEqual([400, 400, 400]);
  });

  test('non-existent category -> 404', async () => {
    const res = await request(app).post('/products').set(auth(admin.token)).send({ ...newProduct(), categoryId: 999 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
  });

  test('VIEWER can read but cannot create, update or delete (403)', async () => {
    const created = await request(app).post('/products').set(auth(admin.token)).send(newProduct());
    const id = created.body.data.id;
    expect((await request(app).get(`/products/${id}`).set(auth(viewer.token))).status).toBe(200);
    expect((await request(app).post('/products').set(auth(viewer.token)).send(newProduct())).status).toBe(403);
    expect((await request(app).patch(`/products/${id}`).set(auth(viewer.token)).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).delete(`/products/${id}`).set(auth(viewer.token))).status).toBe(403);
  });

  test('search, filter and paginate', async () => {
    const other = await prisma.category.create({ data: { name: 'Stationery' } });
    for (const p of [
      { sku: 'A-1', name: 'Wireless Mouse', price: 1, categoryId: category.id },
      { sku: 'A-2', name: 'Gaming Mouse', price: 1, categoryId: category.id, active: false },
      { sku: 'B-1', name: 'Notebook', price: 1, categoryId: other.id },
    ]) await prisma.product.create({ data: p });

    const search = await request(app).get('/products?search=MOUSE').set(auth(viewer.token));
    expect(search.body.data.map((p) => p.sku)).toEqual(['A-1', 'A-2']);

    const activeInCat = await request(app)
      .get(`/products?categoryId=${category.id}&active=true`)
      .set(auth(viewer.token));
    expect(activeInCat.body.data.map((p) => p.sku)).toEqual(['A-1']);

    const inactive = await request(app).get('/products?active=false').set(auth(viewer.token));
    expect(inactive.body.data.map((p) => p.sku)).toEqual(['A-2']);

    const page2 = await request(app).get('/products?page=2&limit=2').set(auth(viewer.token));
    expect(page2.body.data.map((p) => p.sku)).toEqual(['B-1']);
    expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  test('DELETE deactivates (soft delete) and PATCH can reactivate', async () => {
    const created = await request(app).post('/products').set(auth(admin.token)).send(newProduct());
    const id = created.body.data.id;

    const del = await request(app).delete(`/products/${id}`).set(auth(admin.token));
    expect(del.status).toBe(200);
    expect(del.body.data.active).toBe(false);
    expect(await prisma.product.count()).toBe(1); // row still exists

    const react = await request(app).patch(`/products/${id}`).set(auth(admin.token)).send({ active: true });
    expect(react.body.data.active).toBe(true);
  });

  test('PATCH cannot change SKU; unknown product -> 404', async () => {
    const created = await request(app).post('/products').set(auth(admin.token)).send(newProduct());
    const res = await request(app)
      .patch(`/products/${created.body.data.id}`)
      .set(auth(admin.token))
      .send({ sku: 'NEW' });
    expect(res.status).toBe(400); // no updatable fields supplied
    expect((await request(app).get('/products/999').set(auth(admin.token))).status).toBe(404);
  });
});

describe('Categories & warehouses', () => {
  test('categories: ADMIN creates, all roles read, duplicate name -> 409', async () => {
    const created = await request(app).post('/categories').set(auth(admin.token)).send({ name: 'Furniture' });
    expect(created.status).toBe(201);
    expect((await request(app).get('/categories').set(auth(viewer.token))).body.data).toHaveLength(2);
    expect((await request(app).post('/categories').set(auth(admin.token)).send({ name: 'Furniture' })).status).toBe(409);
    expect((await request(app).post('/categories').set(auth(viewer.token)).send({ name: 'X' })).status).toBe(403);
  });

  test('warehouses: create, deactivate via PATCH, filter by active', async () => {
    const wh = await request(app)
      .post('/warehouses')
      .set(auth(admin.token))
      .send({ name: 'Jaipur Central', location: 'Jaipur' });
    expect(wh.status).toBe(201);
    expect(wh.body.data.active).toBe(true);

    const off = await request(app)
      .patch(`/warehouses/${wh.body.data.id}`)
      .set(auth(admin.token))
      .send({ active: false });
    expect(off.body.data.active).toBe(false);

    const activeList = await request(app).get('/warehouses?active=true').set(auth(viewer.token));
    expect(activeList.body.data).toHaveLength(0);
    expect((await request(app).get('/warehouses/999').set(auth(viewer.token))).status).toBe(404);
  });
});
