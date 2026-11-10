
const db = require('./database');

const exercises = require('./exerciseCatalog');

db.serialize(() => {
  const insert = db.prepare(
  `INSERT INTO exercises (name, muscle_group, equipment)
   SELECT ?, ?, ?
   WHERE NOT EXISTS (
     SELECT 1 FROM exercises WHERE name = ?
   )`
);

  for (const exercise of exercises) {
    insert.run([...exercise, exercise[0]]);
  }

  insert.finalize((err) => {
    if (err) {
      console.error('Error adding exercises:', err.message);
    } else {
      console.log('Exercise catalog seeded successfully.');
    }

    db.close();
  });
});