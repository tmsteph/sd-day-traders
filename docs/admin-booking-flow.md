# Esai admin booking flow

Status: development design only. Do not expose or release until the authenticated admin path and booking E2E tests pass.

## Request lifecycle

1. Customer chooses a currently available slot in their local timezone.
2. The system stores the request as `pending` using the canonical Pacific/UTC instant.
3. Customer receives a `request received` acknowledgement. It must not say the appointment is confirmed.
4. Esai receives an actionable notification email with the customer, topic, local time, Pacific time, and request ID.
5. The email includes `Review & approve`, `Ask to reschedule`, and `Decline` links.
6. Email links open the matching request inside authenticated `/admin/`; GET links never change booking state.
7. Approve re-checks Google Calendar availability immediately. If still free, the server creates the Calendar event, adds the customer as attendee, marks the request `confirmed`, and sends confirmation.
8. If the slot became busy, approval is blocked and Esai is prompted to reschedule.
9. Ask to reschedule opens a prefilled admin composer with the original request and suggested alternatives. Esai can edit the message before sending it from his connected Gmail account. The request becomes `reschedule_requested`.
10. Decline asks for confirmation, marks the request `declined`, and sends a courteous customer email.

## Email interaction

Esai should be able to handle the common case from the notification email with very little friction. The buttons deep-link to the exact pending request and intended action, but the final state change happens only after authenticated confirmation in admin. This avoids accidental approvals from email scanners, link previews, or forwarded messages.

For rescheduling, admin opens an editable customer email rather than sending immediately. It prefills the original requested time plus a few currently available alternatives. Esai can change the wording or suggested slots, then tap Send. The customer sees times in their local timezone with Pacific equivalents where useful.

A later enhancement can add a secure customer reschedule link that lets the customer choose one of Esai's suggested alternatives directly, returning the request to `pending` for Esai's final approval.

## Security and UX rules

- Esai must authenticate before any state-changing action.
- No booking state changes on GET requests from email links.
- OAuth refresh tokens stay server-side in the existing 3DVR encrypted Google OAuth vault.
- Google Calendar gets event-write access; Gmail gets send-only access.
- Request URLs use opaque IDs and must not contain customer email or other private booking details.
- Re-check availability at approval time to prevent double booking.
- Public booking fails closed when live availability cannot be verified.
- Customer-facing language distinguishes `requested` from `confirmed` everywhere.
- Action handlers must be idempotent so duplicate email clicks cannot create duplicate calendar events or duplicate customer messages.

## Release tests

- notification email contains safe admin deep links for approve/reschedule/decline
- opening an email link while logged out cannot reveal request details or mutate state
- GET never approves, declines, reschedules, or sends email
- approve performs a fresh busy check before Calendar insertion
- busy-on-approve blocks event creation
- approved request creates one Calendar event and one confirmation path
- reschedule opens editable customer messaging and does not create a Calendar event
- duplicate clicks are idempotent
