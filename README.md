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
| POST | /api/auth/register | FR-01 | Placeholder (501) |
| POST | /api/auth/login | FR-02 | Placeholder (501) |
| POST | /api/auth/logout | FR-03 | Placeholder (501) |
| GET | /api/exercises | FR-05 | Done; run setup first |
| GET, POST | /api/routines | FR-06 | Placeholder (501) |
| PUT, DELETE | /api/routines/:id | FR-07, FR-08 | Placeholder (501) |

Placeholder routes return `501 Not Implemented`. To build one, write a controller function and swap it in for `notImplemented` in the matching file in `backend/routes/`.

## Initial Scope

The first version focuses on user accounts, workout routines, workout logging, history, progress tracking, and pounds/kilograms preferences. Nutrition tracking, social networking, payments, wearable integrations, and AI coaching are outside the initial scope.

## Team

- Mateo Pastorini
- Laura Sachica
- Wasif Shariff
- Taylor Shaver

## Testing the combined project

The Dashboard is at `/` and Profile at `/profile.html`. Profile controls currently update a page preview only; account persistence is scheduled for S1-09. See [the S1-05 guide](docs/S1-05-dashboard-profile.md) for UI checks.

After database setup, `/api/exercises` returns the exercise catalog. Try `/api/exercises?name=bench`, `/api/exercises?muscle=Chest`, or `/api/exercises?equipment=Barbell`. Filters can be combined. Authentication and routine APIs remain placeholders.

To get merged team changes in GitHub Desktop, stop the server, preserve any uncommitted work, switch to `main`, then Fetch origin and Pull origin. Run `npm ci` if dependency files changed, `npm run setup` on a fresh clone, and `npm start`.
