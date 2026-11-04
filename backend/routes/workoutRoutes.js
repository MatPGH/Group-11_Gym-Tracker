const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const workoutController = require('../controllers/workoutController');

const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/', workoutController.startWorkout);
router.post('/:id/sets', workoutController.addSet);
router.put('/:id/sets/:setId', workoutController.updateSet);
router.put('/:id/notes', workoutController.updateNotes);
router.delete('/:id/exercises/:exerciseId', workoutController.removeExercise);
router.put('/:id/weight-unit', workoutController.confirmWeightUnit);
router.get('/', workoutController.listHistory);
router.get('/history', workoutController.completedHistory);
router.post('/:id/finish', workoutController.finishWorkout);
router.get('/:id', workoutController.getWorkoutDetails);

module.exports = router;

