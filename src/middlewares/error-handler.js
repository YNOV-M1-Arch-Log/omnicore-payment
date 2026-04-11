const { logger } = require('../config/logger');

/**
 * Maps Prisma client error codes to HTTP-friendly status + message.
 */
const mapPrismaError = (err) => {
  if (!err.code || !err.code.startsWith('P')) return null;

  switch (err.code) {
    case 'P2002': {
      const field = err.meta?.target?.[0] || 'field';
      return { status: 409, message: `${field} already exists` };
    }
    case 'P2025':
      return { status: 404, message: err.meta?.cause || 'Record not found' };
    case 'P2003':
      return { status: 400, message: 'Invalid reference: related record does not exist' };
    case 'P2014':
      return { status: 400, message: 'Relation constraint violation' };
    case 'P2009':
      return { status: 400, message: 'Validation error in query' };
    default:
      return { status: 500, message: 'Database error' };
  }
};

/**
 * Global Express error handler — must be registered last in app.js.
 */
const errorHandler = (err, req, res, _next) => {
  const correlationId = req.correlationId ? req.correlationId() : 'unknown';

  // ── Prisma errors ──────────────────────────────────────────────────────────
  const prismaError = mapPrismaError(err);
  if (prismaError) {
    logger.warn({ err, correlationId, ...prismaError }, 'Prisma error');
    return res.status(prismaError.status).json({
      error: { message: prismaError.message, status: prismaError.status, correlationId },
    });
  }

  // ── Malformed JSON body ────────────────────────────────────────────────────
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: { message: 'Invalid JSON format', status: 400, correlationId },
    });
  }

  // ── Generic / unhandled errors ─────────────────────────────────────────────
  const status = err.status || 500;

  logger.error(
    { err, correlationId, status, method: req.method, path: req.originalUrl },
    'Unhandled application error',
  );

  res.status(status).json({
    error: {
      message: status === 500 ? 'Internal Server Error' : err.message,
      status,
      correlationId,
    },
  });
};

module.exports = errorHandler;
