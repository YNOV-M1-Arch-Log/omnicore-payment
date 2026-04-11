const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const pinoHttpMiddleware = require('./middlewares/pino-http');
const { correlationId, attachCorrelationId } = require('./middlewares/correlation');
const webhookRoutes = require('./routes/webhook.routes');
const apiRoutes = require('./routes');
const errorHandler = require('./middlewares/error-handler');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(correlationId());
app.use(attachCorrelationId);
app.use(pinoHttpMiddleware);

// ── Webhook endpoint (MUST be before express.json) ────────────────────────
// Stripe signature verification requires the raw request body as a Buffer.
// express.raw captures it without parsing; express.json would break the signature.
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// ── All other routes — parsed JSON ────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'omnicore-payment' });
});

// API routes
app.use('/api', apiRoutes);

// Global error handler
app.use(errorHandler);

module.exports = app;
