const db = require('../database');

function get(sql, params) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function all(sql, params) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function updateProfile(userId, name, weightUnit) {
  await new Promise((resolve, reject) => db.run(
    'UPDATE users SET name = ?, weight_unit = ? WHERE id = ?',
    [name, weightUnit, userId], err => err ? reject(err) : resolve()
  ));
  return require('./userModel').findById(userId);
}

// Dashboard periods use UTC, Monday through Sunday. Only finished workouts count.
async function dashboard(userId, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const params = [userId, monday.toISOString(), now.toISOString()];
  const [weekly, routines, days, recentWorkouts] = await Promise.all([
    get('SELECT COUNT(*) AS count FROM workouts WHERE user_id = ? AND datetime(end_time) >= datetime(?) AND datetime(end_time) <= datetime(?)', params),
    get('SELECT COUNT(*) AS count FROM routines WHERE user_id = ?', [userId]),
    all('SELECT DISTINCT date(end_time) AS day FROM workouts WHERE user_id = ? AND datetime(end_time) <= datetime(?) ORDER BY day DESC', [userId, now.toISOString()]),
    all('SELECT id, start_time AS startTime, end_time AS endTime FROM workouts WHERE user_id = ? AND end_time IS NOT NULL AND datetime(end_time) <= datetime(?) ORDER BY datetime(end_time) DESC, id DESC LIMIT 3', [userId, now.toISOString()])
  ]);
  const completedDays = new Set(days.map(row => row.day));
  const cursor = new Date(today);
  if (!completedDays.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let trainingStreak = 0;
  while (completedDays.has(cursor.toISOString().slice(0, 10))) {
    trainingStreak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { workoutsThisWeek: weekly.count, savedRoutines: routines.count, trainingStreak, recentWorkouts };
}

module.exports = { updateProfile, dashboard };
