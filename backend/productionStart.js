require('dotenv').config();
async function start() {
  const db = require('./database');
  if (db.pool) await require('./initializePostgres')(db.pool);
  const app = require('./app');
  const server = app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`Gym Tracker is ready on port ${server.address().port}.`));
  const stop = () => {
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(() => db.close(() => process.exit(0)));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
start().catch(() => { console.error('Startup failed. Check database connectivity and required environment settings.'); process.exit(1); });
