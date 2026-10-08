// Main API router. Each feature gets its own route file (MVC: routes ->
// controllers -> models).
const express = require('express');

const healthController = require('../controllers/healthController');
const authRoutes = require('./authRoutes');
const exerciseRoutes = require('./exerciseRoutes');
const routineRoutes = require('./routineRoutes');

const router = express.Router();

// GET /api/health - quick check that the server is up.
router.get('/health', healthController.getHealth);

router.use('/auth', authRoutes);         // register, login, logout
router.use('/exercises', exerciseRoutes); // exercise catalog and search
router.use('/routines', routineRoutes);   // create, edit, delete routines

module.exports = router;
