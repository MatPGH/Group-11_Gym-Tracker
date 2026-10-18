# Gym Tracker

Gym Tracker is a simple web application for creating workout routines, logging workouts, and tracking fitness progress. It is being developed for **CSCE 3444 - Software Engineering**.

## Tech Stack

- **Frontend:** HTML, CSS, and JavaScript
- **Backend:** Node.js with Express
- **Database:** SQLite

## Project Structure

```text
frontend/   Browser UI and client-side code
backend/    Express server and application logic
database/   SQLite schema and database files
docs/       SRS and supporting documentation
```

## Getting Started

1. Install [Node.js](https://nodejs.org/) (LTS).
2. Run `npm ci` to install the versions recorded in the lockfile.
3. Copy the example settings file: `cp .env.example .env` (Windows: `copy .env.example .env`).
4. Run `npm run setup` to create the SQLite tables and seed the exercise catalog. This is needed on a fresh clone; rerunning it preserves existing records and avoids duplicate catalog entries.
5. Run `npm run dev` (restarts automatically when you save a file) or `npm start`.
6. Open `http://localhost:3000`. `http://localhost:3000/api/health` should return `{"status":"ok", ...}`.

## Backend Structure (MVC)

```text
backend/
  server.js       starts the server
  app.js          Express setup: JSON parsing, serves frontend/, mounts /api
  routes/         URL -> controller mapping (one file per feature)
  controllers/    request handling logic
  middleware/     404, error handling, "not implemented yet" placeholder
```

Database code (models) can go in `backend/models/` and use `database/schema.sql`.

## API Endpoints

| Method | Path | Requirement | Status |
|---|---|---|---|
| GET | /api/health | - | Done |
| POST | /api/auth/register | FR-01 | Done |
| POST | /api/auth/login | FR-02 | Done |
| POST | /api/auth/logout | FR-03 | Done |
| GET | /api/auth/me | FR-02 | Done (current signed-in user) |
| GET, PUT | /api/profile | FR-04, FR-17 | Done; signed-in user's name and lbs/kg preference |
| GET | /api/dashboard | - | Done; signed-in user's summary and recent workouts |
| GET | /api/exercises | FR-05 | Done; run setup first |
| GET, POST | /api/routines | FR-06 | Routes done (sign-in, owner checks, validation); saving waits on `routineModel.js` (501 until then) |
| PUT, DELETE | /api/routines/:id | FR-07, FR-08 | Same as above |

Placeholder routes return `501 Not Implemented`. To build one, write a controller function and swap it in for `notImplemented` in the matching file in `backend/routes/`.

## Accounts and Sign-In

Sign-in uses a session cookie, so the browser stays signed in automatically. Pages send JSON with `fetch`:

```js
// Register (name, valid email, password of 8+ characters)
await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, email, password })
});

// Sign in, then the cookie is set for later requests
await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

// Who is signed in? 200 { user } or 401 if nobody
const res = await fetch('/api/auth/me');

// Sign out
await fetch('/api/auth/logout', { method: 'POST' });
```

Success responses return `{ "user": { "id", "name", "email", "weightUnit" } }` (logout returns `{ "message" }`). Errors return a status code and `{ "error": "message to show the user" }`:

| Status | Meaning |
|---|---|
| 400 | Missing name, invalid email, or password under 8 characters |
| 401 | Wrong email or password, or not signed in |
| 409 | Email already registered |

To protect a route with private data, add `requireAuth` from `backend/middleware/requireAuth.js` (for example `router.use(requireAuth)` in a routes file). The signed-in user's id is `req.session.userId`, so queries can be limited to that user's records.

Passwords are hashed with scrypt before they're stored. Set `SESSION_SECRET` in your `.env` (see `.env.example`); without it, everyone is signed out whenever the server restarts.

## Routines API

All routine routes require sign-in, and each user can only see, edit, or delete their own routines (other people's routines answer `404`).

| Request | Body | Success |
|---|---|---|
| `GET /api/routines` | - | `{ routines: [...] }` |
| `POST /api/routines` | routine (below) | `201 { routine }` |
| `PUT /api/routines/:id` | routine (below) | `200 { routine }` |
| `DELETE /api/routines/:id` | - | `200 { message }`; past workouts stay saved |

Routine body (the Routines page sends exactly this):

```json
{
  "name": "Upper Body",
  "description": "Optional",
  "exercises": [{ "exercise_id": 1, "target_sets": 3, "target_reps": 10, "exercise_order": 1 }]
}
```

Rules (FR-18): name 1-100 characters, description up to 255, 1-30 exercises, sets 1-100, reps 1-1000, whole numbers only. Breaking a rule answers `400 { error }` with a message to show the user. Exercise order follows the list order.

Each routine comes back as `{ id, name, description, exercises: [{ exercise_id, name, target_sets, target_reps, exercise_order }] }`.

The database part lives in `backend/models/routineModel.js`; its comments describe what each function must do. Once it's connected, set `USE_SAMPLE_DATA = false` at the top of `frontend/routines.js` so the page uses real data.

## Initial Scope

The first version focuses on user accounts, workout routines, workout logging, history, progress tracking, and pounds/kilograms preferences. Nutrition tracking, social networking, payments, wearable integrations, and AI coaching are outside the initial scope.

## Team

- Mateo Pastorini
- Laura Sachica
- Wasif Shariff
- Taylor Shaver

## Testing the combined project

The Dashboard is at `/`, Profile at `/profile.html`, and Sign In at `/login.html`. Create an account or sign in through the browser. Profile settings save to SQLite and Dashboard loads your own activity counts. Main navigation opens working destinations; separate routine/workout/progress/history features are labeled Coming soon until implemented. Run `npm test` for isolated integration tests.

After database setup, `/api/exercises` returns the exercise catalog. Try `/api/exercises?name=bench`, `/api/exercises?muscle=Chest`, or `/api/exercises?equipment=Barbell`. Filters can be combined. Routine routes check sign-in, ownership, and input, but answer `501` until `backend/models/routineModel.js` is connected to SQLite.

To get merged team changes in GitHub Desktop, stop the server, preserve any uncommitted work, switch to `main`, then Fetch origin and Pull origin. Run `npm ci` if dependency files changed, `npm run setup` on a fresh clone, and `npm start`.
