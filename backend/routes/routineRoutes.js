// Routine routes (FR-06 to FR-08).
// Trello cards: "Connect Routine pages to the backend - Wasif" and
// "Make routines save, edit, and delete in SQLite - Taylor"
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const routineController = require('../controllers/routineController');

const router = express.Router();

// Routines are private data: every route needs a signed-in user (FR-02, FR-17).
router.use(requireAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', routineController.listRoutines);           // list my routines
router.post('/', routineController.createRoutine);         // FR-06 create
router.put('/:id', routineController.updateRoutine);       // FR-07 edit
router.delete('/:id', routineController.deleteRoutine);    // FR-08 delete

module.exports = router;
