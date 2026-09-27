const { app, prisma, request, resetDb, createUserAndLogin, auth } = require('./helpers');

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('Registration & login', () => {
  const newUser = { name: 'Asha', email: 'Asha@Example.com', password: 'secret123' };

  test('registers a VIEWER, stores a bcrypt hash, never returns it', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...newUser, role: 'ADMIN' }); // attempt to self-assign ADMIN is ignored

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'asha@example.com', role: 'VIEWER' });
    expect(res.body.data.passwordHash).toBeUndefined();

    const stored = await prisma.user.findUnique({ where: { email: 'asha@example.com' } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(stored.passwordHash).not.toContain('secret123');
  });

  test('rejects a duplicate email with 409', async () => {
    await request(app).post('/auth/register').send(newUser);
    const res = await request(app).post('/auth/register').send(newUser);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('rejects invalid input with 400 and field details', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: '', email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  test('logs in with correct credentials and returns a JWT', async () => {
    await request(app).post('/auth/register').send(newUser);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: newUser.email, password: newUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data.token.split('.')).toHaveLength(3); // header.payload.signature
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  test('wrong password and unknown email give the same 401', async () => {
    await request(app).post('/auth/register').send(newUser);
    const wrongPw = await request(app).post('/auth/login').send({ email: newUser.email, password: 'nope' });
    const noUser = await request(app).post('/auth/login').send({ email: 'x@y.com', password: 'nope' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body);
  });
});

describe('Authentication & authorization', () => {
  test('protected route rejects a request with no token (401)', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(401);
  });

  test('protected route rejects a tampered token (401)', async () => {
    const { token } = await createUserAndLogin('ADMIN');
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
    const res = await request(app).get('/users').set(auth(tampered));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('STAFF and VIEWER are forbidden from admin-only routes (403)', async () => {
    const staff = await createUserAndLogin('STAFF');
    const viewer = await createUserAndLogin('VIEWER');
    expect((await request(app).get('/users').set(auth(staff.token))).status).toBe(403);
    expect((await request(app).get('/users').set(auth(viewer.token))).status).toBe(403);
  });

  test('ADMIN can list users (paginated) and promote a user', async () => {
    const admin = await createUserAndLogin('ADMIN');
    const viewer = await createUserAndLogin('VIEWER');

    const list = await request(app).get('/users?page=1&limit=10').set(auth(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 10, total: 2 });
    expect(list.body.data.every((u) => u.passwordHash === undefined)).toBe(true);

    const promote = await request(app)
      .patch(`/users/${viewer.user.id}/role`)
      .set(auth(admin.token))
      .send({ role: 'STAFF' });
    expect(promote.status).toBe(200);
    expect(promote.body.data.role).toBe('STAFF');
  });

  test('a role change takes effect immediately for existing tokens', async () => {
    const admin = await createUserAndLogin('ADMIN');
    const other = await createUserAndLogin('ADMIN', 'admin2@test.local');
    await request(app).patch(`/users/${other.user.id}/role`).set(auth(admin.token)).send({ role: 'VIEWER' });

    // `other` still holds a token that says ADMIN, but the DB now says VIEWER.
    const res = await request(app).get('/users').set(auth(other.token));
    expect(res.status).toBe(403);
  });

  test('ADMIN cannot change their own role; unknown user is 404; bad role is 400', async () => {
    const admin = await createUserAndLogin('ADMIN');
    const self = await request(app).patch(`/users/${admin.user.id}/role`).set(auth(admin.token)).send({ role: 'VIEWER' });
    const missing = await request(app).get('/users/9999').set(auth(admin.token));
    const badRole = await request(app).patch(`/users/${admin.user.id}/role`).set(auth(admin.token)).send({ role: 'GOD' });
    expect(self.status).toBe(409);
    expect(missing.status).toBe(404);
    expect(badRole.status).toBe(400);
  });
});
