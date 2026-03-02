# Omnicore Payment Service

Microservice for managing Stripe payment intents, processing webhook events, and issuing full or partial refunds. Works alongside `omnicore-order` — a payment is always tied to an order.

## Prerequisites

- Node.js 22+
- PostgreSQL 13+
- npm
- A [Stripe](https://stripe.com) account (free test mode is enough)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) for local webhook testing

## Quick Start

```bash
git clone https://github.com/YNOV-M1-Arch-Log/omnicore-payment.git && cd omnicore-payment
npm install
cp .env.example .env   # fill in your Stripe test keys
npm run dev
```

Open http://localhost:3005/api-docs to browse the API.

## API Documentation

Interactive Swagger UI is available at `/api-docs` when the server is running.

### Payment endpoints (`/api/payments`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/payments/intent` | Create a Stripe PaymentIntent for a pending order |
| `GET` | `/api/payments` | List payments (paginated, filter by `orderId`/`status`) |
| `GET` | `/api/payments/order/:orderId` | Get the payment linked to a specific order |
| `GET` | `/api/payments/:id` | Get a payment by its internal ID |
| `POST` | `/api/payments/:id/refund` | Issue a full or partial refund |

### Webhook endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/stripe` | Stripe webhook receiver — no auth, signature-verified |

The webhook handler listens for `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, and `payment_intent.processing`. On success it automatically advances the linked order to `confirmed`.

## Payment Flow

```
1. Client calls POST /api/payments/intent { orderId }
       ↓
2. Service validates order (status must be "pending"), creates Stripe PaymentIntent
       ↓
3. Service returns { stripeClientSecret, ... } — client passes secret to Stripe.js
       ↓
4. User completes payment on the frontend via Stripe.js
       ↓
5. Stripe calls POST /webhooks/stripe (payment_intent.succeeded)
       ↓
6. Service updates payment → "succeeded", order → "confirmed"
```

`stripeClientSecret` is only included in the response while status is `pending`. It is omitted on all subsequent GET calls once the payment resolves.

## Refund Behaviour

| Request body | Stripe call | Payment status | Order |
|---|---|---|---|
| `{}` or `{ reason }` (no `amount`) | Full refund | → `refunded` | → `cancelled` (stock restored) |
| `{ amount: 10.00, reason }` where `amount < total` | Partial refund | stays `succeeded` | unchanged |

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start dev server with hot reload |
| `npm run lint` | Check code with ESLint |
| `npm run lint:fix` | Auto-fix lint issues |

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | — |
| `PORT` | Server port | No | `3005` |
| `NODE_ENV` | `development` or `production` | No | `development` |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_…` for dev) | Yes | — |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`) | Yes | — |
| `ORDER_SERVICE_URL` | Base URL of the order service | No | `http://localhost:3004` |

## Local Webhook Testing with Stripe CLI

The payment service verifies every webhook using Stripe's signature. For local development you need the Stripe CLI to forward events and provide the correct signing secret.

**1. Install the CLI**

```bash
brew install stripe/stripe-cli/stripe   # macOS
# or see https://stripe.com/docs/stripe-cli#install
```

**2. Login**

```bash
stripe login
```

**3. Get your local webhook secret and start the listener**

```bash
stripe listen --forward-to http://localhost:3005/webhooks/stripe
```

The CLI prints:

```
Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Copy that value into `.env` as `STRIPE_WEBHOOK_SECRET`.

When running behind the gateway (Docker), forward to the gateway instead:

```bash
stripe listen --forward-to http://localhost:3010/webhooks/stripe
```

**4. Trigger test events**

```bash
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
stripe trigger payment_intent.canceled
```

To simulate a real payment against a specific PaymentIntent (the most accurate test):

```bash
# Confirm the intent with a test Visa card via Stripe API
curl -X POST https://api.stripe.com/v1/payment_intents/<pi_id>/confirm \
  -u sk_test_...: \
  -d "payment_method=pm_card_visa" \
  -d "return_url=https://example.com"
```

Stripe will then fire the `payment_intent.succeeded` webhook through your listener.

## Project Structure

```
src/
  config/         # Database, logger, Stripe client, Swagger config
  controllers/    # payment.controller.js, webhook.controller.js
  services/       # payment.service.js — business logic, Stripe calls, order sync
  repositories/   # payment.repository.js — Prisma queries
  routes/         # payment.routes.js (API), webhook.routes.js (Stripe)
  middlewares/    # Logging, correlation ID
  app.js          # Express app — webhook mounts before express.json()
  server.js       # Server bootstrap
```

> **Important**: `express.raw()` is mounted on `/webhooks` before the global `express.json()` middleware. This preserves the raw request body required by Stripe's signature verification. Do not add `express.json()` before the webhook route.

## License

ISC
