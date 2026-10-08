// Catches errors thrown in routes/controllers so the server doesn't crash
// and the browser always gets a JSON response.
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server' : err.message });
};
