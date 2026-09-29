# Audience scoring — administrator

The live administrator page and voting API are served by the small Node application in `railway/`. Railway deploys this repository's `Dockerfile` and connects it to a PostgreSQL service. The separate [audience-scoring-vote](https://github.com/aarjavjain2020-cmyk/audience-scoring-vote) repository publishes the phone page on GitHub Pages.

## Event flow

1. Sign in with the server-configured administrator password.
2. Enter a performer name. Song numbers start at 1 and advance automatically.
3. Audience members submit one whole-number score from 0 through 20 per device and song.
4. Confirm **Close voting**. The song's total is then published in the results.
5. Open the next song. **Show best** presents the current top performer.

The results chart sorts closed songs by total points, highest first. Six bar colors repeat across the performers. Both pages have English and Hindi labels.

## Railway configuration

Set these values on the application service, not in Git:

- `DATABASE_URL` — reference to the PostgreSQL service's `DATABASE_URL`
- `ADMIN_PASSWORD` — administrator password
- `SESSION_SECRET` — random secret used to sign administrator cookies
- `VOTE_SECRET` — random secret used to hash device IDs and rate-limit keys
- `AUDIENCE_ORIGIN` — `https://aarjavjain2020-cmyk.github.io`

The server creates its tables and indexes on startup. Its `/health` route checks the database connection. The administrator cookie is HTTP only, secure on HTTPS, and restricted to the admin site's origin. The API permits cross-origin requests only from the audience site's origin on public routes.

The unique database index enforces one vote per device ID per song. Clearing browser storage or using another device can still bypass a device-only limit; it does not prove one vote per person.

## Local checks

Use Node.js 22 or newer. Run `npm ci` inside `railway/`, then `node --check server.mjs` and `node --check public/app.js`. Set the same environment variables against a PostgreSQL database and run `npm start` to exercise the full flow locally.
