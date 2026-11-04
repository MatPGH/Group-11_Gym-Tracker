const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const bodyWeight = require('../controllers/bodyWeightController');

const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/', bodyWeight.getWeightHistory);
router.post('/', bodyWeight.addWeightEntry);
router.put('/:id', bodyWeight.addWeightEntry);
router.delete('/:id', bodyWeight.deleteWeightEntry);

module.exports = router;
