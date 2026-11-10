# Free public demo: Render + Neon PostgreSQL

Prepared from MatPGH/Group-11_Gym-Tracker main commit
`3e94b7b9741b57cc4133cc44c533e71bf8aed748` on November 10, 2026.

## Deployment settings

- Render workspace: **M's workspace** (`tea-dbpfpc08v5cc73e4tn2g`), pending user confirmation.
- Repository: https://github.com/MatPGH/Group-11_Gym-Tracker
- Proposed deployment branch: `deploy/render-neon-demo`; keep `main` unchanged.
- Render service: Node, **Free**, Ohio region, automatic deploys **off**.
- Build: `npm ci --omit=dev`; start: `npm start`; health check: `/api/health`.
- Node: 24.x, selected through package.json engines.
- Neon organization: **M** (`org-odd-unit-58071928`), verified **Free**.
- Proposed Neon project: `gym-tracker-demo`, with a nearby US region and scale to zero.
- Serve frontend and backend together from Render's assigned HTTPS address.

Private Render environment variables:

| Variable | Value source |
| --- | --- |
| NODE_ENV | `production` |
| SESSION_SECRET | A fresh random secret of at least 32 characters, retained across deploys |
| DATABASE_URL | Neon pooled PostgreSQL connection string |

Never put actual secrets in Git, this document, screenshots, or chat responses.
Remote PostgreSQL connections enforce TLS certificate verification. Render supplies
the HTTPS certificate and HTTP-to-HTTPS redirect. Secure, HttpOnly, SameSite=Lax
session cookies are configured for its reverse proxy. An internal HTTP database
health probe remains allowed. Browser writes from other origins are rejected,
and authentication requests are rate limited.

## What changed

Production requires DATABASE_URL and a strong SESSION_SECRET. It cannot silently
fall back to an ephemeral SQLite file or a random per-restart login secret.
Accounts, routines, workouts, sets, body weights, profile pictures, and login
sessions use PostgreSQL. Each transaction owns a dedicated database connection.
SQLite remains available for local development and the existing regression suite;
its native package is excluded from the production installation.

Startup creates missing PostgreSQL tables and seeds missing exercises in one
transaction protected by an advisory lock. Repeated startup preserves user data
and does not duplicate the exercise catalog. Old sessions are pruned at startup;
there is no recurring database poll to prevent Neon from sleeping.

The database adapter preserves the existing model interface and handles this app's
SQL differences: parameter markers, generated IDs, datetime conversion, case-insensitive
search, camelCase aliases, counts, and conflict-ignore inserts. It is scoped to this
app's queries, not a general SQLite emulation layer.

## Validation completed locally

- All **86 existing tests** passed against SQLite.
- A real **PostgreSQL 18.6** server passed the production HTTP integration test.
- Registration, duplicate email rejection, bad passwords, login, session cookies,
  profile updates, profile picture upserts, body-weight entry, catalog search,
  routine creation/edit/deletion, workout logging/notes/finish/history/dashboard,
  exercise removal, owner isolation, logout, and account deletion were exercised.
- Replaced the Node app process and ran schema initialization again: existing
  sessions, credentials, workout details, routine, and picture remained available.
- HTTPS-only behavior, internal health checks, and cross-origin write rejection passed.
- `npm audit --omit=dev` reported **0 vulnerabilities**. The inherited SQLite
  development dependency tree still has advisory findings; it is not shipped.

Run `npm test` for the existing suite. For PostgreSQL integration, create a fresh
local database with a name beginning `gym_deployment_test`, then set
TEST_DATABASE_URL to its local connection string and run `npm run test:postgres`.
That integration test creates and deletes synthetic test records, and refuses
remote databases. Without TEST_DATABASE_URL it is explicitly skipped.

## Data scope

This is a fresh public demo database. No local SQLite database, existing account
records, or personal workout history will be uploaded. The original local projects
and their SQLite files remain unchanged. All data created in the demo will be
stored in Neon rather than Render's disposable filesystem.

An initial SQLite data import is a separate change requiring review and approval.
Sleep/redeploy persistence is not a backup: accidental record deletion or database
project deletion still removes data. Before future schema changes, make a database
export through the provider or pg_dump and keep it private.

## Free-tier limits and cost controls

- Render sleeps after 15 minutes without traffic; waking can take about a minute.
  It grants 750 free instance hours per workspace each calendar month.
- Render bandwidth and build limits also apply. With a payment method on file,
  overages can be billed even for a Free service. Before service creation, verify
  no payment method is attached, or verify enforceable zero-overage controls;
  stop if a guaranteed zero-cost configuration is unavailable.
- Neon Free currently provides 1 GB storage and 100 CU-hours per project/month,
  with no time limit and no card required. Database cold starts and quota limits
  apply. Keep the organization on Free and never enable paid upgrades.
- Avoid Render's free PostgreSQL: it expires after 30 days.
- No availability guarantee; appropriate for a class/demo, not an always-on service.
- Free-tier terms may change. Do not add uptime pings that bypass idle sleep.

Sources, checked November 10, 2026:
https://render.com/docs/free
https://render.com/docs/blueprint-spec
https://neon.com/pricing
https://node-postgres.com/features/ssl

## Approval boundary and remaining live checks

Nothing has been pushed or publicly deployed during preparation. No hosted database
has been created, and no payment details have been entered.

After explicit approval: confirm the workspace above, verify zero-cost controls,
publish the prepared deployment branch, create the Free Neon database, configure
private Render settings, and create the Free Render web service. Keep automatic
deploys off. The final public URL is assigned by Render and cannot be reported
before creation.

Then test on the live HTTPS URL using synthetic accounts: registration/login,
workout logging and completion, user isolation, logout/login, and workout persistence
through an actual manual Render redeploy. Delete test accounts afterward and verify
the service and database are still on Free. Observe idle wake behavior when feasible.
Local process replacement has been tested; real Render sleep/redeploy, Neon TLS,
mobile browser behavior, and the assigned public URL remain unverified until then.
