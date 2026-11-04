const sqlite3 = require('sqlite3');
const db = require('../database');

const run = (connection, sql, params = []) => new Promise((resolve, reject) => {
  connection.run(sql, params, function (error) {
    error ? reject(error) : resolve(this.changes);
  });
});

function picture(userId) {
  return new Promise((resolve, reject) => db.get(
    'SELECT image FROM profile_pictures WHERE user_id = ?', [userId],
    (error, row) => error ? reject(error) : resolve(row?.image || null)
  ));
}

async function savePicture(userId, image) {
  if (image === null) await run(db, 'DELETE FROM profile_pictures WHERE user_id = ?', [userId]);
  else await run(db, 'INSERT INTO profile_pictures(user_id, image) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET image = excluded.image', [userId, image]);
}

// Use a dedicated connection so unrelated requests cannot join this transaction.
async function deleteAccount(userId) {
  const connection = await new Promise((resolve, reject) => {
    const opened = new sqlite3.Database(db.filename, error => error ? reject(error) : resolve(opened));
  });
  connection.configure('busyTimeout', 5000);
  let begun = false;
  try {
    await run(connection, 'PRAGMA foreign_keys = ON');
    await run(connection, 'BEGIN IMMEDIATE');
    begun = true;
    for (const sql of [
      'DELETE FROM workout_sets WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = ?)',
      'DELETE FROM workouts WHERE user_id = ?',
      'UPDATE workouts SET routine_id = NULL WHERE routine_id IN (SELECT id FROM routines WHERE user_id = ?)',
      'DELETE FROM routine_exercises WHERE routine_id IN (SELECT id FROM routines WHERE user_id = ?)',
      'DELETE FROM routines WHERE user_id = ?',
      'DELETE FROM body_weight_entries WHERE user_id = ?',
      'DELETE FROM profile_pictures WHERE user_id = ?',
      'DELETE FROM users WHERE id = ?'
    ]) await run(connection, sql, [userId]);
    await run(connection, 'COMMIT');
    begun = false;
  } catch (error) {
    if (begun) await run(connection, 'ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await new Promise((resolve, reject) => connection.close(error => error ? reject(error) : resolve()));
  }
}

module.exports = { picture, savePicture, deleteAccount };
