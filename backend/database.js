
const path = require('path');
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in production; SQLite storage is not persistent on free Render.');
}
if (process.env.DATABASE_URL) {
  module.exports = require('./postgresDatabase')(process.env.DATABASE_URL);
} else {
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
}
