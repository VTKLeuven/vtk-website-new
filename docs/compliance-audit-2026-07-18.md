# GDPR and EU AI Act code audit

Audit date: 18 July 2026  
Scope: `apps/web`, `apps/logistiek`, shared packages, Prisma schema,
environment template and relevant operational documentation.

## Executive summary

The codebase previously collected substantially more data than the privacy
statement described, loaded browser monitoring without a consent choice, had no
self-service export/deletion path, did not enforce the stated retention
periods, and exposed an opt-in bypass for bulk mailing exports. The optional
album face-search feature also involved biometric processing without a
repository-enforced approval gate.

The repository fixes below close those code-level gaps. They materially improve
privacy by default, transparency, data minimisation, consent, data-subject
rights and retention. They do **not** by themselves establish legal compliance:
VTK must complete the controller-side decisions and evidence listed under
“Actions required from VTK”.

## Findings and repository fixes

### 1. Privacy statement did not match actual processing — high

**Found:** `packages/db/prisma/schema.prisma` stores profile address and birth
date, personal email, study profile, memberships, mailing choices, tickets,
questionnaire answers, payments/refunds, equipment and van reservations,
free-text notes, card/door logs and optional biometric data. The old statement
primarily described login name/email and technical session data.

**Fixed:**

- Expanded both Dutch and English statements in
  `packages/i18n/src/messages/{nl,en}.json`.
- Added purpose/legal-basis, data-category, recipient, transfer, biometric,
  retention and rights information.
- Added contextual notices to profile/onboarding, ticket checkout and both
  logistics request forms.
- Added `docs/privacy-processors.md` as the maintainable processor inventory.

### 2. Browser Sentry monitoring and replay loaded without consent — high

**Found:** Sentry browser tracing and session replay initialized whenever a DSN
was configured. Session replay can be particularly intrusive even when an SDK
masks common fields.

**Fixed:**

- Added an equal-choice cookie panel and persistent settings control:
  `apps/web/components/site/CookieConsent.tsx`.
- Browser Sentry now starts only after an explicit `analytics` choice in
  `apps/web/instrumentation-client.ts`.
- Browser replay forces all text masking and media blocking.
- Default PII and server local-variable capture are disabled in the Sentry
  browser/server/edge configuration.
- Added the bilingual `/cookies` policy and footer links.

**Design note:** changing consent reloads the page because Next.js client
instrumentation runs before React hydration. Withdrawal therefore stops a
running browser SDK immediately after reload.

### 3. Biometric face search lacked a safe default and full notice — critical

**Found:** album face search sends a selfie to Immich face recognition and
compares a biometric embedding with the album index. The UI had a consent
checkbox and temporary-selfie cleanup, but the environment example enabled the
feature and there was no repository gate requiring a DPIA/approval.

**Fixed:**

- `GALLERY_FACE_SEARCH_ENABLED` now requires the exact value `true`; missing or
  other values keep the feature off.
- `.env.example` defaults it to `false` and names the prerequisite DPIA,
  album/participant notice, consent and retention checks.
- Consent wording now explicitly says a biometric template is created and that
  the selfie/template is removed.
- The privacy statement explains the album-index issue, objection/deletion
  channel and absence of solely automated significant decisions.

**Important:** this does not solve the lawful creation of biometric templates
for everybody appearing in existing album photos. The feature must remain off
until VTK completes the actions below.

### 4. No self-service access/export or erasure — high

**Found:** members could edit a profile but could not download their data or
request account erasure. Admin deletion risked either incomplete deletion or
loss of transaction integrity.

**Fixed:**

- Added authenticated JSON export at `GET /api/account/export`.
- Added export and deletion controls to the account page.
- Added a shared erasure service in `apps/web/lib/privacy/account.ts`.
- Self-service and admin deletion now remove authentication, memberships,
  permissions and current operational associations, delete the avatar object,
  and replace the user with a non-identifying tombstone.
- Ticket orders, audit records and financial/reservation history that may need
  to remain are preserved but direct identifiers, free-text notes, IP data and
  delivery payloads are scrubbed where the schema permits.
- Exports deliberately exclude password hashes, OAuth credentials, session
  tokens, ticket access tokens and provider secrets.

### 5. Stated retention was not technically enforced — high

**Found:** sessions had expiries but historical logs, webhook payloads, outbox
payloads and request fingerprints had no general cleanup routine.

**Fixed:**

- Added authenticated `POST /api/privacy/maintenance`.
- Added `apps/web/lib/privacy/retention.ts` to:
  - delete expired sessions and verification records;
  - delete door logs after 365 days by default;
  - purge old audit IP/metadata, payment webhook payloads and sent/failed email
    payloads after 90 days by default;
  - clear order fraud fingerprints after 30 days by default.
- Added environment controls for all three periods.

Financial transaction rows are intentionally excluded from automatic deletion;
their period must follow VTK’s approved Belgian accounting/legal schedule.

### 6. Non-consensual bulk mailing export — high

**Found:** `ALLE_STUDENTEN` exported every current student even when no mailing
category was selected.

**Fixed:** the downloadable mailing-list registry now exposes only explicit
opt-in categories. Necessary operational messages should be sent by the
relevant order/reservation/member workflow and not through a marketing-list
bypass.

### 7. Data minimisation in onboarding — medium

**Found:** street, house number, postcode, city, birth date and personal email
were mandatory even though the code did not establish that every member needed
them.

**Fixed:** these fields are optional in both validation and UI. Empty values are
stored as `null`, and the form explains which details are optional and links to
the privacy statement.

### 8. Third-party media before user action — medium

**Found:** a default YouTube thumbnail contacted `i.ytimg.com` before the
visitor played the video.

**Fixed:** the code no longer generates a third-party YouTube poster URL.
Editors can configure a first-party poster; YouTube/Vimeo is contacted only
after deliberate playback. The cookie policy explains this boundary.

### 9. Profile action trusted a caller-supplied user ID — security/privacy

**Found:** the locale update action accepted a `userId` parameter from its
caller rather than resolving the authenticated subject itself.

**Fixed:** `updateProfileAction` now calls `requireSession()` and updates only
`session.user.id`.

## Actions required from VTK

These are organizational or production-environment actions and cannot be
completed truthfully in source code:

1. **Approve the privacy statement.** Have the controller/legal adviser verify
   the legal bases, address/contact details, minors position and actual
   retention periods. Publish the deployed update and record its version.
2. **Complete the records of processing.** Turn
   `docs/privacy-processors.md` into a signed/owned Article 30 register covering
   purposes, categories, recipients, transfers, security, retention and owners.
3. **Sign and verify supplier terms.** Record the actual host/database/SMTP
   entities, Mollie, Hetzner, Sentry and any subprocessors; retain DPAs,
   controller terms and transfer safeguards. Configure EEA regions where
   available.
4. **Schedule retention.** Generate a strong
   `PRIVACY_MAINTENANCE_SECRET` and have the production scheduler send a daily
   authenticated `POST` to `/api/privacy/maintenance`. Monitor failures and
   document runs. Review the 365/90/30-day defaults.
5. **Keep biometric search disabled.** Before setting
   `GALLERY_FACE_SEARCH_ENABLED=true`, complete and approve a DPIA; establish a
   valid Article 9 condition; inform people whose faces are indexed; provide an
   effective objection/deletion path; restrict Immich access; verify deletion
   from active data and backups; test consent withdrawal; and document the AI
   Act role/classification and human oversight. Existing album embeddings need
   a separate documented decision.
6. **Configure Sentry.** Confirm the Sentry region, DPA, subprocessors,
   retention and transfer mechanism. Restrict project access and integrations,
   test masking with realistic forms, and ensure server-side error logging has
   an approved legitimate-interest basis and short retention.
7. **Set financial retention.** With the accountant/legal adviser, define which
   ticket and logistics payment fields must be kept and for how long. Add a
   reviewed archive/anonymisation procedure for the end of that period.
8. **Handle requests operationally.** Assign `it@vtk.be`, identity-verification,
   one-month response tracking, third-party redaction, processor notification,
   backup handling and exception documentation.
9. **Review historic data.** The maintenance task governs future recurring
   cleanup once scheduled; run it deliberately in production, review old
   account/payment/free-text data, and remediate backups and provider copies.
10. **Train authorized users.** Limit mailing exports, ticket attendee access,
    door logs, album administration and free-text notes to those who need them.
    Document export deletion and access reviews.
11. **Cookie verification.** On production, scan the public and authenticated
    sites before and after each choice to confirm no optional third-party
    requests or storage occur before consent.
12. **Incident readiness.** Maintain a breach register, escalation contacts,
    processor notification routes and the 72-hour supervisory-authority
    assessment workflow.

## Deployment checklist

- Keep `GALLERY_FACE_SEARCH_ENABLED=false` until the biometric checklist is
  formally approved.
- Set production `BETTER_AUTH_URL` and a unique, high-entropy
  `BETTER_AUTH_SECRET`; never deploy the example/default secret.
- Set a strong `PRIVACY_MAINTENANCE_SECRET`; schedule and monitor the endpoint.
- Verify Sentry is absent before diagnostics consent and active only after it.
- Confirm cookie settings can withdraw consent and reload without Sentry.
- Exercise a test-account export and erasure in staging; verify object storage,
  login invalidation, tombstoning and transaction integrity.
- Confirm `ALLE_STUDENTEN` no longer appears as a downloadable mailing list.
- Review production provider names/regions and update the public statement if
  the generic wording is insufficient.
- Run type checks, lint, tests and a production build.

## Legal reference points used

- [General Data Protection Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [EU Artificial Intelligence Act 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [Belgian Data Protection Authority — cookies](https://dataprotectionauthority.be/professioneel/thema-s/cookies)
- [Belgian Data Protection Authority — facial recognition](https://dataprotectionauthority.be/burger/thema-s/recht-op-afbeelding/gezichtsherkenning-en-recht-op-afbeelding)

## Limitations

This is a technical compliance audit, not legal advice. It reviews the checked
out repository and its documented configuration, not live production traffic,
supplier dashboards, contracts, historic backups, organizational practices or
the contents of the production database.
