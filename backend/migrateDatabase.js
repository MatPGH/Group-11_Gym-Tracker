// Existing weights have no recorded unit. Leave that fact explicit until the
// owner confirms it; never infer historical units from today's preference.
module.exports = async function migrateDatabase(db) {
  await new Promise((resolve, reject) => db.run('CREATE TABLE IF NOT EXISTS workout_removed_exercises (workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE, exercise_id INTEGER NOT NULL REFERENCES exercises(id), PRIMARY KEY(workout_id, exercise_id))', error => error ? reject(error) : resolve()));
  const columns = await new Promise((resolve, reject) => db.all('PRAGMA table_info(workouts)', (error, rows) => error ? reject(error) : resolve(rows)));
  if (columns.length && !columns.some(column => column.name === 'weight_unit')) {
    await new Promise((resolve, reject) => db.run('ALTER TABLE workouts ADD COLUMN weight_unit TEXT', error => error ? reject(error) : resolve()));
  }
};
