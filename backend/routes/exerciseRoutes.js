// Exercise catalog routes (FR-05).
const express = require('express');
const exerciseController = require('../controllers/exerciseController');

const router = express.Router();

// GET /api/exercises?name=&muscle=&equipment=
router.get('/', exerciseController.getExercises);

module.exports = router;
