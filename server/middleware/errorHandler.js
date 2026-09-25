function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  console.error(`[ERROR] ${req.method} ${req.url} →`, err.message);
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
}

module.exports = errorHandler;
