const db = require('../database');

function all(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) =>
      err ? reject(err) : resolve(rows)
    );
  });
}

async function getWeightHistory(userId, unit) {
  const entries = await all(
    `SELECT id, date, weight
     FROM body_weight_entries
     WHERE user_id = ?
     ORDER BY date DESC, id DESC`,
    [userId]
  );

  return entries.map(entry => ({
    ...entry,
    weight: unit === 'kg'
      ? entry.weight / 2.20462
      : entry.weight
  }));
}

async function addWeightEntry(userId, date, weight, unit) {
  return new Promise((resolve, reject) => {
  const weightInLbs = unit === 'kg'
    ? weight * 2.20462
    : weight;
    db.run(
      `INSERT INTO body_weight_entries (user_id, date, weight)
       VALUES (?, ?, ?)`,
      [userId, date, weightInLbs],
      function (err) {
        if (err) return reject(err);

        resolve({
          id: this.lastID,
          date,
          weight
        });
      }
    );
  });
}
module.exports = { getWeightHistory, addWeightEntry };