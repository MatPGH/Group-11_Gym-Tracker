
const db = require('../database');

function getExercises(req, res, next) {
  const { name, muscle, equipment } = req.query;

  let sql = 'SELECT id, name, muscle_group, equipment FROM exercises WHERE 1 = 1';
  const params = [];

  if (name) {
    sql += ' AND name LIKE ?';
    params.push(`%${name}%`);
  }

  if (muscle) {
    sql += ' AND muscle_group LIKE ?';
    params.push(`%${muscle}%`);
  }

  if (equipment) {
    sql += ' AND equipment LIKE ?';
    params.push(`%${equipment}%`);
  }

  sql += ' ORDER BY name';

  db.all(sql, params, (err, rows) => {
    if (err) {
      return next(err);
    }

    res.json(rows);
  });
}

module.exports = { getExercises };