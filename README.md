# Audience scoring — admin and API

This repository contains the administrator site and the shared API for the audience voting site. The live site is hosted with Sites. The audience interface is in the separate `audience-scoring-vote` repository.

## Event flow

1. Sign in with the administrator password.
2. Enter a performer name. Song numbers start at 1 and advance automatically.
3. The audience submits one whole-number score from 0 to 20 per device and song.
4. Confirm **Close voting** to finalize the song. Its total then appears in the public results.
5. Start the next song.

The results chart sorts performers by total points, highest first. Six muted bar colors repeat as the list grows. Both sites have English and Hindi labels.
The admin can also select **Show best** to present the current top performer on a clean screen.

## Runtime configuration

Keep these values in the host's secret/environment settings, never in Git:

- `ADMIN_PASSWORD` — password for the admin page
- `SESSION_SECRET` — random secret used to sign admin sessions
- `VOTE_SECRET` — random secret used to hash device IDs and rate-limit keys
- `AUDIENCE_ORIGIN` — exact HTTPS origin of the audience site for CORS
- `DB` — D1 database binding

Apply the SQL migrations in `drizzle/` when deploying. The database stores performers, songs, scores, and hashed device IDs. The unique vote index is the server-side duplicate check. Clearing browser storage or switching devices can bypass a device-only rule; it does not establish one vote per person.

## Local development

Use Node.js 22 or newer. Run `npm ci`, `npm run db:generate` after schema edits, and `npm run build`. For a local Worker, configure a D1 binding and ignored `.dev.vars` secrets, apply migrations with Wrangler, then run `npm start`.
