# SD Day Traders booking API

This service owns the trusted booking workflow. The public site never receives Google OAuth tokens.

## Model

- Google Calendar is the source of truth for availability.
- A customer request creates a private, opaque `[PENDING]` calendar hold. It blocks the slot but is not a confirmed appointment.
- Esai receives an email with review/approve, reschedule, and decline deep links. GET links only open authenticated admin; they never mutate state.
- Approve performs a fresh overlap check, turns the existing hold into the confirmed event, adds the customer as an attendee, and sends confirmation.
- Reschedule/decline make the hold transparent so the slot is released and send the customer an update.
- Explicit admin blackout blocks are ordinary private Google Calendar events marked by private extended properties.

## Google permissions

The API requests only identity, Google Calendar event read/write, and Gmail send. It does not request Gmail read access. Refresh tokens are encrypted at rest with AES-256-GCM.

## Development

`npm run dev` starts a local static site + fake Google backend on port 4318. The fake adapter exists only in `server/dev-server.js` and is never used by `server/start.js`.

`npm test` runs server state/idempotency tests and the Playwright browser flow.

## Production gate

Before changing `data-booking-api` on the customer-facing HTML, deploy `server/start.js` on the server, configure the environment in `.env.example`, connect Esai's Google account, and run a controlled end-to-end request with a test customer address. Only then point a preview at the API. Promote production only after the exact preview artifact passes the booking browser smoke tests.
