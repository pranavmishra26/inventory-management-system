// Shared test helpers. Tests run against a real PostgreSQL test database
// (DATABASE_URL from .env.test), through the real Express app via Supertest.
// Spring equivalent: @SpringBootTest + MockMvc against a test database.

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/config/prisma');

// Wipe every table so each test starts from a known, empty state.
async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE order_items, orders, stock_movements, inventory,
                   products, categories, warehouses, users
    RESTART IDENTITY CASCADE
  `);
}

// Creates a user with the given role directly in the DB, then logs in through the API.
async function createUserAndLogin(role, email = `${role.toLowerCase()}@test.local`) {
  const password = 'Password123';
  const user = await prisma.user.create({
    data: {
      name: `${role} Tester`,
      email,
      passwordHash: await bcrypt.hash(password, 4), // low cost: tests only
      role,
    },
  });
  const res = await request(app).post('/auth/login').send({ email, password });
  return { user, token: res.body.data.token };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { app, prisma, request, resetDb, createUserAndLogin, auth };
