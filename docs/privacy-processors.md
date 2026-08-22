# Privacy processor register

Owner: VTK board / IT  
Last repository review: 8 August 2026

This is the repository-side inventory. The controller must complete the
production-specific fields, keep signed agreements and review it whenever a
supplier or configuration changes.

| Recipient / processor | Purpose and data | Repository evidence | Operator checks still required |
| --- | --- | --- | --- |
| Associatie KU Leuven / KU Leuven | OIDC authentication (name, verified email) and optional student-card verification (card/r-number response) | `packages/auth/src/auth.ts`, `apps/web/lib/sso.ts`, `apps/web/lib/kul-card.ts`, `apps/web/lib/student-card.ts`, `.env.example` | Confirm controller/recipient roles, notice and retention with KU Leuven |
| Hosting and PostgreSQL provider | Runs the applications and database; potentially all application data and technical logs | `DATABASE_URL`, deployment configuration | Record legal entity, EEA region, DPA, backups, access list and deletion schedule |
| Hetzner Object Storage (configured default) | Profile photos, page/event assets and other uploaded objects | `packages/storage/src/index.ts`, `.env.example` | Confirm contract/DPA, `fsn1` location, encryption, backup/version retention and admin access |
| Configured SMTP provider | Transactional ticket, reservation and operational email; recipient, message body and delivery metadata | `apps/web/lib/mail.ts`, ticket outbox, `.env.example` | Record actual provider/entity, DPA, region, transport security and provider-side log retention |
| Brevo (Sendinblue) | Opt-in mailing lists: name, preferred email and study attributes (year/programme booleans) of active, opted-in members, synced from the site | `apps/web/lib/brevo/`, `apps/web/app/api/admin/mailinglijsten/sync/`, `.env.example` (`BREVO_KEY`) | Only active when `BREVO_KEY` is set. Record Brevo (Sendinblue GmbH/entity), DPA, EEA region, list access, sender authentication and provider-side retention; keep the site the single source of truth (sync prunes) |
| Mollie | Hosted payment processing, order reference, amount, status and payment identifiers | `apps/web/lib/ticketing/payments/mollie.ts`, logistics payment code | Keep merchant DPA/terms, document controller roles, enable least-access accounts and set dashboard retention |
| Immich instance managed for VTK | Photo albums and, only after approval, biometric face templates | `apps/web/lib/immich-gallery.ts`, `apps/web/lib/immich-face-search.ts`, `infra/immich/` | Complete DPIA before enabling face search; document hosting, access, album notices, subject requests, template deletion and backups |
| Umami, self-hosted by VTK (no third party) | Consent-gated, cookieless page-view statistics: page path, referrer, screen size, browser language and a daily-rotating hash of IP address plus user agent; the IP address itself is not stored | `apps/web/lib/analytics.ts`, `apps/web/app/layout.tsx`, `infra/docker-compose.yml` (`umami`, `umami-db-init`), `.env.example` (`UMAMI_*`) | Runs on VTK's own server and database, so there is no recipient to sign a DPA with; the hosting and PostgreSQL row already covers where it lives. Keep `DISABLE_TELEMETRY=1` so the instance itself calls nobody, limit dashboard accounts, set a retention window and never point `UMAMI_PUBLIC_URL` at a hosted Umami |
| Sentry | Server errors; optional consent-gated browser errors, traces and masked replay | `apps/web/instrumentation-client.ts`, `apps/web/instrumentation.ts`, Sentry config | Record actual Sentry entity, DPA, region, retention, integrations, access and transfer safeguards; keep replay/PII settings restricted |
| YouTube / Vimeo | External media requested by the visitor; receives IP/browser data after play | `apps/web/lib/videoEmbed.ts`, `apps/web/app/[locale]/media/AftermoviePlayer.tsx` | Keep click-to-load behaviour, review privacy mode/provider settings and avoid third-party posters before play |

## Student-card data held on VTK's own side

No third party is involved here; this is what the applications keep after a card
has been read, and it belongs in the hosting/PostgreSQL row above.

- `StudentCard` caches `serial`, `cardAppId`, r-number and the name KU Leuven
  returned, so a card that has been read once no longer needs a KU Leuven call.
  It backs the door, the bar scanner and the Theokot pickup counter.
- `TicketOrderItem.rNumber` links a ticket to a student card for events with
  `cardCheckIn` enabled. It holds only the r-number of the logged-in buyer, and
  archiving the event wipes every one of them: after the event it has no purpose.
- `TicketScanLog` deliberately stores neither r-number nor card identifier, not
  even hashed. That log outlives the event and a stable per-person reference in
  it would silently undo the wipe above.
- The offline scanner manifest carries a salted hash of the cards of that event's
  attendees, mapped to a ticket code, and lives in the browser storage of the
  scanning device. The salt is regenerated per download, so two manifests cannot
  be correlated; it is pseudonymisation, not secrecy, and it exists so the file
  is not a list of real card identifiers.

## Minimum supplier-file checklist

For every row, store outside this public repository:

- signed DPA or documented controller-to-controller terms;
- legal entity, contact and approved subprocessors;
- processing countries and transfer mechanism;
- security review, breach-notification commitment and deletion assistance;
- configured retention, backup retention and an owner/review date;
- evidence that production access is limited and periodically reviewed.

