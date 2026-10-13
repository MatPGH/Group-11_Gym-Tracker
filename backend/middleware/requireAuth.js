// Blocks a route unless someone is signed in (FR-02).
// Use it on any route with private data, e.g. in routineRoutes.js:
//   const requireAuth = require('../middleware/requireAuth');
//   router.use(requireAuth);
// Inside the controller, the signed-in user's id is req.session.userId.
module.exports = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Please sign in first.' });
};
