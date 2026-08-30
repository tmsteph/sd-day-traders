# Release gate

Customer-facing changes are not considered releasable until all of these are true:

1. `node --check script.js` and `git diff --check` pass.
2. Playwright booking tests pass locally and in GitHub Actions.
3. The Vercel preview is smoke-tested in a real browser at desktop and mobile sizes.
4. Any email/payment/calendar integration is tested end-to-end with a controlled test recipient and an observable receipt. A successful HTTP response alone is not proof of delivery.
5. Production is checked after promotion. If the public site differs from the verified preview, roll back rather than debugging on customers.

Until a server-side booking system satisfies rule 4, consultation requests use the explicit prefilled `mailto:` flow and never claim that an email was sent automatically.
