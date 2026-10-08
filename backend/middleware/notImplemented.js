// Placeholder for routes that exist but aren't built yet.
// Replace with a real controller function when the feature is done.
module.exports = (req, res) => {
  res.status(501).json({ error: `${req.method} ${req.originalUrl} is not implemented yet` });
};
