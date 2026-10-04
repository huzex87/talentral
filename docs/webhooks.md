# Outbound webhooks

Hubs can send their events to their own systems (a CRM, a spreadsheet automation, a funder's platform) as they happen. Owners and admins manage endpoints at **Settings → Webhooks** (`/dashboard/<hub>/webhooks`).

## Events

| Event | When |
| --- | --- |
| `application.submitted` | Someone applies to one of the hub's programmes |
| `application.status_changed` | An application moves to a new status (includes the previous one) |
| `learner.enrolled` | A learner joins a cohort |
| `learner.completed` | A learner completes their cohort |
| `certificate.issued` | A certificate is issued |
| `certificate.revoked` | A certificate is revoked |
| `ping` | The "Send test event" button |

Events are queued by database triggers (`app.queue_webhook`), so every way of making a change (screens, imports, bulk actions) sends them.

## Requests

A JSON `POST` to the endpoint, with headers `Talentral-Event`, `Talentral-Delivery` (the delivery id, stable across retries) and `Talentral-Signature: t=<unix seconds>,v1=<hex>`.

```json
{
  "id": "6a0c…",
  "type": "application.status_changed",
  "created_at": "2026-10-04T10:15:02.112Z",
  "hub": "kirkira",
  "data": {
    "application": { "id": "…", "reference": "KIR-26-4JQX6", "status": "under_review", "previous_status": "shortlisted",
                     "full_name": "Umar Lawal", "email": "umar@example.com", "track": "Digital Marketing", "submitted_at": "…" },
    "programme": { "id": "…", "slug": "idice-centre-of-excellence-cohort-1", "title": "iDICE Centre of Excellence Cohort 1" }
  }
}
```

## Verifying

`v1` is the HMAC-SHA256 of `"<t>.<raw request body>"`, keyed with the endpoint's signing secret (`whsec_…`), in hex. Compare in constant time and reject timestamps more than five minutes old. Use the delivery id to ignore duplicates.

## Delivery and retries

- Answer with any 2xx status within 10 seconds. Redirects are not followed.
- Failures are retried after 1, 5, 30, 120, 360 and 720 minutes (about a day), then marked failed. Any delivery can be sent again from the page.
- The scheduler (`/api/cron/reminders`) delivers due events every few minutes; deliveries and payloads are kept 30 days.
- Endpoints must be public HTTPS addresses. Talentral refuses private, local and link-local networks, including names that resolve to them. `WEBHOOK_ALLOW_PRIVATE=1` lifts this for the test suite only; never set it in production.
- A hub can have up to 10 endpoints. Adding, pausing, changing and removing endpoints and replacing secrets are audited (`webhook.*`), without the secret.
