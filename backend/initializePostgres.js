const fs = require('node:fs');
const path = require('node:path');

module.exports = async function initializePostgres(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize schema/seed work across overlapping deployments.
    await client.query('SELECT pg_advisory_xact_lock(344411)');
    await client.query(fs.readFileSync(path.join(__dirname, '../database/schema.postgres.sql'), 'utf8'));
    for (const exercise of require('./exerciseCatalog')) {
      await client.query(`INSERT INTO exercises(name, muscle_group, equipment)
        SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = $1)`, exercise);
    }
    await client.query('DELETE FROM session WHERE expire < CURRENT_TIMESTAMP');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};
