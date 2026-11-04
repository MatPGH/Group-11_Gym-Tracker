# Gym Tracker

A web app for workout routines, workout logging, and fitness progress, built by CSCE 3444 Group 11.

Users can manage their profile and picture, build routines, log workouts, review session history and charts, and add, edit or delete body-weight entries. Account deletion removes the account and its saved data after confirmation.

## Prerequisites

- [Node.js LTS](https://nodejs.org/) (includes npm)
- [Git](https://git-scm.com/downloads) if cloning

## Download

Clone the repository, then open its folder:

```sh
git clone https://github.com/MatPGH/Group-11_Gym-Tracker.git
cd Group-11_Gym-Tracker
```

Or select **Code → Download ZIP** on [GitHub](https://github.com/MatPGH/Group-11_Gym-Tracker), extract it, and open a terminal in the extracted folder.

## Run locally

1. Install dependencies: `npm ci`
2. Create the database and load exercises: `npm run setup`
3. Start the app: `npm start`
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

Keep the terminal open while using the app. Press **Ctrl+C** to stop it.

## Workout logging

Active workouts support adding/removing exercises, editing sets, and optional session notes (up to 2,000 characters). Removing an exercise affects this session only. Notes save with **Save notes**, when leaving the field, or before finishing. A failed save keeps the workout open for retry.

Workout weights are stored internally in pounds and converted to your profile preference in active workouts, history and progress charts. Older records did not store a unit. After upgrading, open an older workout and confirm whether its recorded weights were originally lbs or kg. Values remain unchanged and stay out of weight-chart calculations until confirmed. Do not guess if you cannot identify the original unit.

Run `npm run setup` after upgrading. The database update also runs on server startup, preserves existing records, and can be repeated safely. Run `npm test` to check the application.
