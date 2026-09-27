// Entry point: connects to the database, then starts the HTTP server.
// Spring equivalent: the main() method with SpringApplication.run(...).

const env = require('./config/env');
const prisma = require('./config/prisma');
const app = require('./app');

async function start() {
  // Fail fast: if PostgreSQL is unreachable, don't start accepting requests.
  // (A tiny real query, because the connection pool only connects when first used.)
  await prisma.$queryRaw`SELECT 1`;
  console.log('Connected to PostgreSQL');

  const server = app.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Close the HTTP server and DB connections cleanly on Ctrl+C / shutdown.
  const shutdown = async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(async (err) => {
  console.error('Failed to start server:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
