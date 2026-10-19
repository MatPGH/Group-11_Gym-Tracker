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
| GET, POST | /api/routines | FR-06 | Implemented; signed-in user's routines stored in SQLite |
| PUT, DELETE | /api/routines/:id | FR-07, FR-08 | Implemented; owner-only edits/deletes; historical workouts preserved |

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

The SQLite implementation lives in `backend/models/routineModel.js`. The Routines page uses the real API (`USE_SAMPLE_DATA = false`). Routine writes run sequentially on dedicated transaction connections so simultaneous saves cannot overlap transactions.

## Initial Scope

The first version focuses on user accounts, workout routines, workout logging, history, progress tracking, and pounds/kilograms preferences. Nutrition tracking, social networking, payments, wearable integrations, and AI coaching are outside the initial scope.

## Team

- Mateo Pastorini
- Laura Sachica
- Wasif Shariff
- Taylor Shaver

## Testing the combined project

The Dashboard is at `/`, Profile at `/profile.html`, and Sign In at `/login.html`. Create an account or sign in through the browser. Profile settings save to SQLite and Dashboard loads your own activity counts. Routines supports creating, editing, and deleting saved routines. Start Workout offers a saved routine, custom workout, or empty workout. Progress and History remain Coming soon until implemented. Run `npm test` for isolated integration tests.

After database setup, `/api/exercises` returns the exercise catalog. Try `/api/exercises?name=bench`, `/api/exercises?muscle=Chest`, or `/api/exercises?equipment=Barbell`. Filters can be combined. Routine routes check sign-in, ownership, and input, and persist routines and their ordered exercise targets in SQLite.

To get merged team changes in GitHub Desktop, stop the server, preserve any uncommitted work, switch to `main`, then Fetch origin and Pull origin. Run `npm ci` if dependency files changed, `npm run setup` on a fresh clone, and `npm start`.

## Starting a workout

Open `/workout.html`, choose a saved routine, select exercises for a one-session custom workout, or choose an empty workout. Review the exercise targets, then Continue to workout. Start Routine on the Routines page opens the same selector with that routine selected. The header Profile icon is consistent on Dashboard, Routines, Start Workout, the workout preview, Progress, and History.

The next page (`/active-workout.html`) currently previews the selection; logging sets and finishing/saving workouts are separate team tasks. No workout history record is created by this selection step.

### Workout handoff for the logging page

`frontend/workout-draft.js` writes a temporary per-tab `sessionStorage` entry named `gymTracker.workoutDraft`. Its version-1 shape is:

```js
{
  version: 1, userId: 1, mode: 'routine', // 'routine', 'custom', or 'empty'
  name: 'Push Day', routineId: 3, // null for custom/empty
  exercises: [{ exercise_id: 1, name: 'Bench Press',
    target_sets: 3, target_reps: 10, exercise_order: 1 }]
}
```

Custom selections use initial targets of 3 sets and 10 reps. Empty selections have no exercises. Saved routines retain their ordered targets and are fetched again before the handoff. Continuing replaces the previous selection in this tab. The preview rechecks the authenticated user and clears invalid or other-account drafts. This is temporary UI state; future workout APIs must revalidate ownership, exercise IDs, and values on the server and persist finished sessions in SQLite.

For manual testing, try all three choices, edit a saved routine and choose it again, test the no-routines state with a new account, search for an exercise with no matches, and verify Profile icons at desktop and 360 px widths.
