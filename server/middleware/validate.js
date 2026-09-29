/**
 * Zod-based request validation middleware factory.
 *
 * Usage:
 *   const { validate } = require('../middleware/validate');
 *   router.post('/register', validate(registerSchema), handler);
 *
 * On failure returns: 422 Unprocessable Entity with structured error array.
 */

const { ZodError } = require('zod');

/**
 * @param {import('zod').ZodSchema} schema - Zod schema to validate req.body against
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(422).json({ error: 'Validation failed', errors });
    }
    req.body = result.data; // Replace with parsed + coerced data
    next();
  };
}

module.exports = { validate };
