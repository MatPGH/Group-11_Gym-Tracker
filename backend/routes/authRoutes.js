// Account routes (FR-01 to FR-03).
// Trello card: "Make registration, login, and logout work - Wasif"
const express = require('express');
const authController = require('../controllers/authController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.post('/register', authController.register); // FR-01
router.post('/login', authController.login);       // FR-02
router.post('/logout', authController.logout);     // FR-03
router.get('/me', requireAuth, authController.me);  // current signed-in user

module.exports = router;
