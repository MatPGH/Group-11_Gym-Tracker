const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const bodyWeight = require('../controllers/bodyWeightController');

const router = express.Router();

router.use(requireAuth);

router.get('/', bodyWeight.getWeightHistory);
router.post('/', bodyWeight.addWeightEntry);

module.exports = router;