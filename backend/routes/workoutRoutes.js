
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
router.get('/', workoutController.listHistory);
router.post('/:id/finish', workoutController.finishWorkout);
router.get('/:id', workoutController.getWorkoutDetails);
module.exports = router;
