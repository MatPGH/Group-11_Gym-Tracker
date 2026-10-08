// Exercise catalog routes (FR-05).
// Trello card: "Add exercise catalog data and basic exercise search - Taylor"
const express = require('express');
const notImplemented = require('../middleware/notImplemented');

const router = express.Router();

// GET /api/exercises?name=&muscle=&equipment=
router.get('/', notImplemented);

module.exports = router;
