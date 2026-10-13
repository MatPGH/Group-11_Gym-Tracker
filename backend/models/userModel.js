// User model: all SQL for the users table lives here (the "M" in MVC).
const db = require('../database');

// Columns that are safe to send to the browser (never password_hash).
const PUBLIC_COLUMNS = 'id, name, email, weight_unit';

function findByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function findById(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function create({ name, email, passwordHash }) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, passwordHash],
      function onInsert(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

module.exports = { findByEmail, findById, create };
