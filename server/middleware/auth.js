const { verifyAccessToken } = require('../utils/jwt');

/**
 * Authentication Middleware.
 * Verifies Bearer JWT token from Authorization header.
 * Attaches decoded payload to req.user.
 */
function authenticate(req, res, next) {
  let token = null;

  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid authentication token' });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token has expired' });
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
  }
}

module.exports = { authenticate };
