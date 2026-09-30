# Audience scoring — administrator

**[Open the administrator site](https://audience-scoring-admin-aj2020.aarjavjain2020.workers.dev)** · **[Open the audience site](https://aarjavjain2020-cmyk.github.io/audience-scoring-vote/)**

The live administrator page and voting API are served by the Cloudflare Worker in `cloudflare/`, with a D1 database. The separate [audience-scoring-vote](https://github.com/aarjavjain2020-cmyk/audience-scoring-vote) repository publishes the phone page on GitHub Pages.

## Event flow

1. Sign in with the server-configured administrator password.
2. Enter a performer name. Song numbers start at 1 and advance automatically.
3. Audience members submit one whole-number score from 0 through 20 per device and song.
4. Confirm **Close voting**. The song's total is then published in the results.
5. Open the next song. **Show best** presents the current top performer.

The results chart sorts closed songs by total points, highest first. Six bar colors repeat across the performers. Both pages have English and Hindi labels.

## Cloudflare configuration

Create a D1 database, put its ID in `wrangler.jsonc`, and apply `cloudflare/schema.sql`. Set these secrets on the Worker, not in Git:

- `ADMIN_PASSWORD` — administrator password
- `SESSION_SECRET` — random secret used to sign administrator cookies
- `VOTE_SECRET` — random secret used to hash device IDs and rate-limit keys

`AUDIENCE_ORIGIN` is set to `https://aarjavjain2020-cmyk.github.io` in `wrangler.jsonc`. The administrator cookie is HTTP only, secure on HTTPS, and restricted to the admin site's origin. The API permits cross-origin requests only from the audience site's origin on public routes.

Code deployments are manual: after authenticating Wrangler with a Cloudflare token that can edit Workers Scripts, run `npx wrangler deploy --config wrangler.jsonc`. The deployed Worker retains the Cloudflare-stored administrator secrets. GitHub Pages deploys the separate audience site automatically after changes to its `main` branch.

The unique database index enforces one vote per device ID per song. Clearing browser storage or using another device can still bypass a device-only limit; it does not prove one vote per person.

## Local checks

Run `npx wrangler d1 execute audience-scoring --local --file cloudflare/schema.sql` and `npx wrangler dev --config wrangler.jsonc --local`. A local `.dev.vars` file supplies throwaway testing secrets. Do not commit it.
