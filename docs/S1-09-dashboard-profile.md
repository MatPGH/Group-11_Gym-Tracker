# S1-09: Dashboard, Profile, and navigation integration

Mateo Pastorini's October 17, 2026 task: connect Dashboard/Profile/navigation to backend data. Acceptance: profile settings save and the main pages navigate correctly.

## Try it

1. Run `npm ci`, then `npm run setup` on a fresh clone. Existing databases are preserved.
2. Copy `.env.example` to `.env`, set a random `SESSION_SECRET`, and run `npm start`.
3. Open the local server and select Create an account, or sign in with an existing account.
4. Open Profile, change the display name and lbs/kg preference, and select Save settings.
5. Refresh, return to Dashboard, then reopen Profile. Both settings should remain saved and Dashboard should greet you by the saved name.
6. Try a spaces-only name. It must not replace saved settings.
7. Log out, then revisit Profile. You should return to Sign In.

## Implementation and boundaries

- Uses Wasif's cookie session and `req.session.userId`; neither account identity nor saved settings come from localStorage.
- `GET /api/profile` returns only id, name, email, and weightUnit. `PUT /api/profile` accepts name (trimmed, 1–60 characters) and weightUnit (`lbs` or `kg`). Updates always target the signed-in user; supplied user IDs are ignored.
- `GET /api/dashboard` returns the user's completed workouts this week, saved routine count, daily training streak, and three most recent completed workouts. Weeks begin Monday and dates use UTC. An active streak can end today or yesterday. Unfinished and future workouts do not count. Empty accounts show zero and explanatory text.
- Main navigation uses working links, with the active destination marked. Routines, Start Workout, Progress, and History have clearly labeled Coming soon destinations until their separate team tasks land. These pages do not implement those features.
- A minimal sign-in/register page connects the existing auth APIs so the integration is testable in a browser. Registration is followed by login to start the session.
- Profile picture remains a placeholder. Account deletion and optional fitness goals are outside this task's acceptance scope.
- Failed saves retain typed edits and display an error. Successful saves update displayed settings only after the database responds. Expired sessions redirect to Sign In.
- Wasif's session store remains in memory, so restarting the server requires signing in again. Account/profile data stays in SQLite. No database migration or new dependency is needed.

## Verification

`npm test` runs isolated SQLite/HTTP integration tests for authentication requirements, profile validation and persistence, two-user isolation, Dashboard aggregation/week/streak boundaries, navigation destinations, and logout. Test data is isolated from the app's database.

Browser checks cover account creation/login, trimmed names, both unit choices, refresh persistence, whitespace validation, all navigation destinations, logout/redirect, unavailable-server errors, and narrow mobile layout. Profile persistence is also checked across a server restart and fresh login.
