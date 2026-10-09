
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'database', 'gym_tracker.db');
const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');

const schema = fs.readFileSync(schemaPath, 'utf8');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exitCode = 1;
    return;
  }

  db.exec(schema, (err) => {
    if (err) {
      console.error('Error creating tables:', err.message);
      process.exitCode = 1;
    } else {
      console.log('Database and tables created successfully!');
    }

    db.close();
  });
});