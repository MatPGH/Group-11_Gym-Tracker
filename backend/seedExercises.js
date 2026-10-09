
const db = require('./database');

const exercises = [
  ['Push-Up', 'Chest', 'Bodyweight'],
  ['Bench Press', 'Chest', 'Barbell'],
  ['Incline Dumbbell Press', 'Chest', 'Dumbbell'],
  ['Squat', 'Quadriceps', 'Barbell'],
  ['Goblet Squat', 'Quadriceps', 'Dumbbell'],
  ['Lunge', 'Quadriceps', 'Bodyweight'],
  ['Deadlift', 'Back', 'Barbell'],
  ['Lat Pulldown', 'Back', 'Cable'],
  ['Seated Cable Row', 'Back', 'Cable'],
  ['Overhead Press', 'Shoulders', 'Dumbbell'],
  ['Lateral Raise', 'Shoulders', 'Dumbbell'],
  ['Biceps Curl', 'Biceps', 'Dumbbell'],
  ['Triceps Pushdown', 'Triceps', 'Cable'],
  ['Plank', 'Core', 'Bodyweight'],
  ['Leg Curl', 'Hamstrings', 'Machine']
];

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