# S1-05: Dashboard and Profile

## Run and review

1. In GitHub Desktop, Fetch origin and switch to `mateo-s1-05-dashboard-profile`.
2. In the repository folder, run `npm ci` to install the versions in the existing lockfile.
3. Run `npm start` and open http://localhost:3000.
4. Use the profile icon to open Profile, or visit http://localhost:3000/profile.html.
5. Stop the server with Ctrl+C before switching branches.

Node.js is required. No new dependencies or environment variables were added.

## Scope

Dashboard includes main actions, summary placeholders, recent activity guidance, and profile access. Profile includes an editable display name, picture placeholder, and pounds/kilograms radio buttons. Both follow the dark/lime SRS reference and adapt to mobile and desktop screens.

This is a frontend preview, not an authenticated application. Summary values remain dashes until real data is connected. Apply preview updates the name and confirms the selected units only on the current page. Refreshing or leaving resets those changes. No profile data is written to browser storage or SQLite.

Unimplemented destinations and account actions open explanatory dialogs. Log Out and Delete Account do not claim to change an account. The picture remains a placeholder, as required by S1-05.

## Team integration

- Base: latest main at d9a77e3 (Express, SQLite setup, and exercise search already merged).
- `frontend/index.html` is the Dashboard entry page.
- `frontend/profile.html` contains the Profile page.
- `frontend/dashboard-profile.css` and `.js` hold page styles and preview interactions.
- The starter `styles.css` and `app.js`, backend, database, and package files are unchanged.
- Coordinate with the shared styling/navigation owner before consolidating page styles.
- S1-09 should load/save profile data through authenticated backend endpoints and replace placeholder actions with the team's actual page URLs. Do not substitute localStorage for account persistence.

## Review checklist

- Open both pages at 360px phone width and desktop width; check for horizontal scrolling and navigation overlap.
- Open Profile from Dashboard and return with either Dashboard link.
- Enter a name, select kg, and Apply preview; verify the name and kg confirmation. Repeat with lbs.
- Try an empty or spaces-only name; it must not replace the displayed name.
- Refresh Profile; the preview resets as described on screen.
- Click each future-feature action; read and dismiss its explanation with Got it or Escape.
- Use Tab to check focus visibility and keyboard access to links, radio buttons, and dialogs.
- Check the browser console for errors and `/api/health` for a successful response.

## Validation performed

- `npm ci` and JavaScript syntax check passed using Node 24.
- DOM-based checks passed for both pages, every feature handler, local navigation targets, whitespace-only validation, trimmed display names, lbs/kg selection, and safe rendering of text containing HTML.
- HTTP checks against the existing Express app returned 200 for Dashboard, Profile, both new assets, and `/api/health`.
- `git diff --check` passed.
- Real-browser visual, responsive-layout, and keyboard-dialog checks remain manual: the test environment could not download a working Chromium archive. DOM checks used a temporary test-only dependency outside the repository; no application dependencies changed.
