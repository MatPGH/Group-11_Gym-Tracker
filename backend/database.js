
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'database', 'gym_tracker.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to Gym Tracker database.');

    db.run('PRAGMA foreign_keys = ON');
  }
});

module.exports = db;