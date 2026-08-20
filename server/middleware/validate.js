import { logger } from '../logger.js';

/**
 * Express middleware generator that validates req.body, req.query, or req.params against a Zod schema.
 * Returns 400 Bad Request with formatted error messages on validation failure.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source];
      const result = schema.safeParse(dataToValidate);

      if (!result.success) {
        const issues = result.error?.issues || result.error?.errors || [];
        const errors = issues.map(err => ({
          field: Array.isArray(err.path) ? err.path.join('.') : String(err.path || ''),
          message: err.message
        }));

        logger.warn(`[VALIDATION_FAILED] ${req.method} ${req.originalUrl}`, {
          source,
          errors,
          ip: req.ip
        });

        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Érvénytelen bemeneti adatok.',
          details: errors,
          timestamp: new Date().toISOString()
        });
      }

      // Replace with sanitized, parsed data
      req[source] = result.data;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const validateBody = (schema) => validate(schema, 'body');
