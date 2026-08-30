# Booking reliability notes

The customer-facing consultation form should prefer seamless delivery through the existing 3DVR mail relay, while retaining the prefilled mail client flow as a fallback if the relay is unavailable.

Customer-facing guarantees:

- Never claim a consultation is reserved until Esai confirms it.
- Keep the submit button disabled while a request is in flight.
- If automatic delivery fails or times out, open the existing prefilled email request instead of dropping the booking.
- Avoid sending customer confirmation emails from the browser until the booking endpoint has a fixed recipient policy and abuse controls.
