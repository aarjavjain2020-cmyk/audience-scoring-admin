# Audience scoring — administrator

**[Open the administrator site](https://audience-scoring-admin-aj2020.aarjavjain2020.workers.dev)** · **[Open the audience site](https://aarjavjain2020-cmyk.github.io/audience-scoring-vote/)**

The live administrator page and voting API are served by the Cloudflare Worker in `cloudflare/`, with a D1 database. The separate [audience-scoring-vote](https://github.com/aarjavjain2020-cmyk/audience-scoring-vote) repository publishes the phone page on GitHub Pages.

## Event flow

1. Sign in with the server-configured administrator password.
2. On Days 1–4, register each performer once. Each audition receives a unique contestant ID; identical names are allowed. Song numbers advance automatically.
3. Audience members submit one whole-number score from 0 through 20 per device and song.
4. Confirm **Close voting**. The closed performance appears in the results. Move to the next day only after closing voting; previous days remain saved.
5. After Day 4, choose 10 or 15 finalists. Rankings combine all four audition days using exact average scores, not rounded display values. If the cutoff is tied, record the organisers' ballot winners from the tied group. Confirming the list locks auditions and finalist selection.
6. Move to Day 5. Select each finalist by ID/name and open a new performance. Final scores start at zero, and the audience can vote again. Each finalist performs once. Audition history remains available.

Charts default to average points out of 20, highest first. Each page has its own day filter and subtle total-points toggle; these preferences are never sent to the API. The separate table always shows averages and vote counts. Six colors repeat by contestant ID, and score labels stay above the animated bars. Both pages have English and Hindi labels. The admin can export the selected results group as CSV.

No minimum vote count applies. A performance with no votes has no average (shown as a dash) and cannot be ranked. Register each real person only once; the app cannot infer identity from a name. Matching names receive distinct IDs. Day advancement and finalist confirmation require confirmation and cannot be undone through the UI.

## Cloudflare configuration

Create a D1 database, put its ID in `wrangler.jsonc`, apply `cloudflare/schema.sql`, then apply `cloudflare/migrate_competition.sql` exactly once. On an existing pre-competition database, only apply the competition migration; it preserves existing performances as Day 1 auditions. Back up the database before migrating. Set these secrets on the Worker, not in Git:

- `ADMIN_PASSWORD` — administrator password
- `SESSION_SECRET` — random secret used to sign administrator cookies
- `VOTE_SECRET` — random secret used to hash device IDs and rate-limit keys

`AUDIENCE_ORIGIN` is set to `https://aarjavjain2020-cmyk.github.io` in `wrangler.jsonc`. The administrator cookie is HTTP only, secure on HTTPS, and restricted to the admin site's origin. The API permits cross-origin requests only from the audience site's origin on public routes.

Code deployments are manual: after authenticating Wrangler with a Cloudflare token that can edit Workers Scripts, run `npx wrangler deploy --config wrangler.jsonc`. The deployed Worker retains the Cloudflare-stored administrator secrets. GitHub Pages deploys the separate audience site automatically after changes to its `main` branch.

The unique database index enforces one vote per device ID per song. Clearing browser storage or using another device can still bypass a device-only limit; it does not prove one vote per person.

## Local checks

Run `node cloudflare/competition.test.mjs` with Node 24 to test the actual Worker handlers against an isolated SQLite database. It covers migration preservation, days, identity, qualification, ballots, voting restrictions, and fresh final scores.

For Wrangler local development, apply both SQL files to a fresh local database with `--config wrangler.jsonc --local`, then run `npx wrangler dev --config wrangler.jsonc --local`. A local `.dev.vars` file supplies throwaway testing secrets. Do not commit it.
