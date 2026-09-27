// One shared PrismaClient for the whole app.
// Spring equivalent: the single DataSource / EntityManagerFactory bean.
//
// How the pieces fit:
//   PrismaClient  - the object our repositories call (prisma.product.findMany(...))
//   PrismaPg      - a "driver adapter": Prisma turns our query into SQL and hands it
//                   to `pg` (node-postgres), which sends it to PostgreSQL.
//                   Think: Hibernate generating SQL, the JDBC driver executing it.
//
// The adapter owns a connection pool, so we create exactly ONE client and reuse it.
// Creating one per request would quickly exhaust PostgreSQL connections.

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const env = require('./env');

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
