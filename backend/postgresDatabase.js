// Preserve the models' callback interface while using a pooled PostgreSQL driver.
const { Pool, types } = require('pg');
types.setTypeParser(20, Number); // COUNT returns bigint; API counts are numbers.

function translate(sql) {
  let index = 0;
  const ignore = /INSERT OR IGNORE/i.test(sql);
  sql = sql.replace(/INSERT OR IGNORE/i, 'INSERT')
    .replace(/BEGIN IMMEDIATE/i, 'BEGIN')
    .replace(/datetime\(([^)]+)\)/gi, 'CAST($1 AS timestamptz)')
    .replace(/date\(([^)]+)\)/gi, "to_char(CAST($1 AS timestamptz) AT TIME ZONE 'UTC', 'YYYY-MM-DD')")
    .replace(/\bLIKE\b/g, 'ILIKE')
    .replace(/\bAS (userId|startTime|endTime|routineName)\b/g, 'AS "$1"')
    .replace(/\?/g, () => '$' + ++index).trim().replace(/;$/, '');
  if (ignore) sql += ' ON CONFLICT DO NOTHING';
  return sql;
}

function adapt(executor, close) {
  function query(sql, params, callback, mode) {
    if (typeof params === 'function') { callback = params; params = []; }
    params ||= [];
    let statement = translate(sql);
    if (/^PRAGMA foreign_keys/i.test(statement)) {
      queueMicrotask(() => callback?.call({ changes: 0 }, null));
      return;
    }
    // Only these tables have generated IDs that existing models consume.
    const returnsId = mode === 'run' && /^INSERT INTO (users|exercises|routines|routine_exercises|workouts|workout_sets|body_weight_entries)\b/i.test(statement);
    if (returnsId) statement += ' RETURNING id';
    executor.query(statement, params).then(result => {
      const context = { lastID: result.rows[0]?.id, changes: result.rowCount };
      callback?.call(context, null, mode === 'get' ? result.rows[0] : result.rows);
    }, error => {
      if (error.code === '23505') error.code = 'SQLITE_CONSTRAINT';
      if (error.code === '23503') error.message = 'FOREIGN KEY constraint failed';
      callback?.(error);
    });
  }
  return {
    dialect: 'postgres',
    run(sql, params, callback) { query(sql, params, callback, 'run'); },
    get(sql, params, callback) { query(sql, params, callback, 'get'); },
    all(sql, params, callback) { query(sql, params, callback, 'all'); },
    configure() {},
    close(callback) { Promise.resolve().then(close).then(() => callback?.(), error => callback?.(error)); }
  };
}

module.exports = function createDatabase(connectionString) {
  const url = new URL(connectionString);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!local) {
    // Enforce encrypted, certificate-verified traffic, regardless of URL options.
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl']) url.searchParams.delete(key);
  }
  const pool = new Pool({ connectionString: url.toString(), max: 5,
    idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000,
    ...(!local ? { ssl: { rejectUnauthorized: true } } : {}) });
  pool.on('error', () => console.error('Database connection interrupted.'));
  const db = adapt(pool, () => pool.end());
  db.pool = pool;
  db.openConnection = async () => {
    const client = await pool.connect();
    return adapt(client, () => client.release());
  };
  return db;
};
