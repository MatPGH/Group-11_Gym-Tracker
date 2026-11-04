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
     ORDER BY date ASC, id ASC`,
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
function updateWeightEntry(userId, date, weight, unit, id) {
  return new Promise((resolve, reject) => db.run(
    'UPDATE body_weight_entries SET date = ?, weight = ? WHERE id = ? AND user_id = ?',
    [date, unit === 'kg' ? weight * 2.20462 : weight, id, userId],
    function (error) { error ? reject(error) : resolve(this.changes ? { id, date, weight } : null); }
  ));
}
function deleteWeightEntry(userId, id) {
  return new Promise((resolve, reject) => db.run(
    'DELETE FROM body_weight_entries WHERE id = ? AND user_id = ?', [id, userId],
    function (error) { error ? reject(error) : resolve(this.changes); }
  ));
}
module.exports = { getWeightHistory, addWeightEntry, updateWeightEntry, deleteWeightEntry };
