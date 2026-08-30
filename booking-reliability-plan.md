# Booking reliability plan

1. Keep the existing mail client flow as a fallback.
2. Prefer automatic booking notifications through the existing 3DVR mail relay.
3. Show an in-page success state only after the relay returns success.
4. Do not tell the customer a time is reserved until Esai confirms it.
5. Harden the mail relay before adding automatic customer confirmation emails or broader public recipient support.
6. Add Google Calendar OAuth later for free/busy checks and confirmed calendar invitations.
