# VMI Deliveries

A simple web app for planning deliveries and collections of hire equipment. It reads confirmed orders from **Current RMS**, works out what size van each order needs, groups the day's jobs into runs for the drivers who are in, plans each route against Google traffic so every delivery slot is hit, writes the run to **Google Calendar**, emails the driver and the account handlers, and keeps clients updated with live arrival times as the driver works through the round.

Everything is designed to be understood at a glance by someone who has never used routing software.

## What it does

| Screen | Who uses it | What it is for |
| --- | --- | --- |
| **Today's board** (`/`) | Dispatcher | The day's jobs on the left, runs in the middle, map on the right. Press **Plan my day** and the app builds the runs; drag stops around to adjust; press **Send to driver** to publish. |
| **Jobs** | Dispatcher / account handlers | Every delivery and collection. Imported from Current RMS or added by hand. Edit contacts, addresses, slots, sizes and notes. |
| **Drivers** | Office | Who drives, which days they work, licences, holidays and sick days. Each driver gets a private phone link. |
| **Vehicles** | Office | The fleet with load space and weight limits. |
| **Emails sent** | Office | Every email the app has sent (or would send, before email is configured). Click to read it. |
| **Settings** | Office | Depot address, working hours, sizing assumptions, and a status panel showing which connections are on. |
| **Driver's phone view** (`/driver/<link>`) | Drivers | Today's run in order: client, address (tap to navigate), phone numbers, other contacts on site, items, notes. Buttons for **On my way** (emails the client a live ETA), **Delivered / Collected** (with the name of who received it) and **Problem** (alerts the office). |

### How the planning works

1. **Sizing.** Each order's items are added up into cubic metres and kilograms (using product dimensions from Current RMS, remembered per product, or defaults from Settings, with a packing factor for cases). The job is rated *small van / medium van / large van / Luton / 7.5t*.
2. **Who is in.** Drivers are available if today is one of their working days, they have no holiday or sickness booked, and they are active. Licences are checked against the vehicle (a 7.5t needs C1).
3. **Building runs.** *Plan my day* sweeps around the depot by direction, adding jobs to a round until the biggest available van would be overloaded, the stop limit is reached, a delivery slot would be missed, or the day would run too long. Each round gets the **smallest van that fits** and a licensed driver.
4. **Routing.** Travel times come from the Google Routes API for the planned departure time (so 08:00 on the North Circular is treated as 08:00 on the North Circular). The stop order is solved by the app so that time slots are respected, which Google's own waypoint optimiser does not do. The route is redrawn every time you change a run.
5. **Start time.** Runs leave as late as they safely can (minus a buffer you set) so drivers are not sitting outside a studio at 07:30 for a 10:00 slot.
6. **Publishing.** *Send to driver* writes one event per run to the shared Google Calendar (driver invited when credentials allow), emails the driver a run sheet with the phone link, and emails each account handler the plan for their jobs.
7. **Live updates.** When the driver taps *Start run*, every client on the run gets "out for delivery, expect us between 10:00 and 11:00". *On my way* at each stop sends "driver arriving about 10:32" using a live travel time. *Delivered* sends a confirmation naming who signed for it. *Problem* alerts the account handler and dispatch.

Without any keys the app runs in **demo mode**: sample orders, estimated drive times, and emails saved as previews on the *Emails sent* page. Every connection switches on the moment its key is added.

## Quick start

```bash
npm install
cp .env.example .env        # fill in what you have; everything is optional
npm run db:setup            # creates the database and loads sample data
npm run dev                 # http://localhost:3000
```

Then open **Today's board**, press **Load sample orders** if the day is empty, and **Plan my day**.

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Run locally with hot reload |
| `npm run build && npm start` | Production build and server |
| `npm test` | Unit tests for sizing, scheduling, routing and the planner |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm run db:setup` | Apply migrations and load demo data (safe to re-run) |
| `npm run db:studio` | Browse the database |

## Connecting the real services

All configuration is in `.env` (see `.env.example` for every option). The **Settings** page shows which connections are live and has a *Test* button for each.

### Current RMS

1. In Current RMS go to **System Setup → Integrations → API** and create an API key.
2. Set `CURRENT_RMS_SUBDOMAIN` (the part before `.current-rms.com`) and `CURRENT_RMS_API_KEY`.
3. Optional tuning:
   * `CURRENT_RMS_IMPORT_STATES` which opportunity states count as confirmed (default `order,reserved`).
   * `CURRENT_RMS_DELIVERY_FIELD` / `CURRENT_RMS_DELIVERY_VALUES` if you use a custom field on opportunities to say whether delivery is needed. Without it every confirmed order is imported and the dispatcher presses *Skip* on ones the client collects.
   * `CURRENT_RMS_VOLUME_FIELD` / `CURRENT_RMS_WEIGHT_FIELD` if product sizes live in custom fields rather than the built-in weight and dimensions.

What is imported: the client (organisation), the opportunity contact with phone and email, other people at the organisation as secondary contacts, the account handler (opportunity owner), the destination / venue address, the item list, and the *deliver* and *collect* phases as time slots (falling back to "before the hire starts" and "after it ends"). Re-importing refreshes those details but keeps your planning, notes and any size you set by hand. Orders that are cancelled in Current are marked cancelled here and taken off their run.

Sync runs when you press **Sync from Current** on the board or **Import orders** on the Jobs page. For automatic syncing every 15 to 30 minutes, set `CRON_SECRET` and call `GET /api/cron/sync` with `Authorization: Bearer <secret>` from Vercel Cron, GitHub Actions, cron-job.org or similar.

### Google Maps (routes, traffic, addresses)

1. In Google Cloud create a project, enable **Routes API**, **Geocoding API** and **Maps JavaScript API**, and set up billing (the free monthly allowance covers a small fleet comfortably).
2. Create a **server key** restricted to Routes and Geocoding, and put it in `GOOGLE_MAPS_API_KEY`.
3. Create a **browser key** restricted to Maps JavaScript API and to your website address, and put it in `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.

Without a server key the app uses free UK postcode lookups (postcodes.io) for addresses and estimated drive times. Without a browser key the board shows a simple sketch map instead of Google's.

### Google Calendar

Create a calendar called something like "Deliveries" in Google Workspace and share it with every driver. Then either:

* **Service account (recommended).** In Google Cloud enable the **Calendar API**, create a service account and download its JSON key. Share the Deliveries calendar with the service account's email address (*Make changes to events*). Put the JSON (single line or base64) in `GOOGLE_SERVICE_ACCOUNT_JSON` and the calendar's ID (from the calendar's settings page) in `GOOGLE_CALENDAR_ID`. If your Workspace admin grants the service account domain-wide delegation, also set `GOOGLE_CALENDAR_IMPERSONATE` to a dispatch user so drivers receive proper invitations; otherwise events still appear on the shared calendar.
* **OAuth.** Create OAuth client credentials, obtain a refresh token for the dispatch Google account (for example with the OAuth Playground), and set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` and `GOOGLE_CALENDAR_ID`.

Each run becomes one event from *load from* time to *back at depot*, titled with the driver, vehicle and stop count, with every stop, slot, address, contact and note in the description, plus the driver's phone link. Republishing updates the same event; deleting a run removes it.

### Email

Any SMTP service works. For Google Workspace: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=deliveries@yourdomain`, `SMTP_PASS=<an app password>`, `EMAIL_FROM="VMI Deliveries <deliveries@yourdomain>"`. Until this is set, emails are saved as previews on the *Emails sent* page.

Set the dispatch email and phone in **Settings**; dispatch is copied on driver and client emails and gets problem alerts.

### Login

Set `APP_PASSWORD` to require a shared team password for the office screens (drivers never log in; their link is their key). Set `APP_SECRET` to a long random string and `APP_URL` to the public address of the app so links in emails and calendar entries are correct.

## Deploying

The app is a standard Next.js server. Any host that runs Node 20+ with a persistent disk works out of the box with the SQLite database, for example Railway, Render, Fly.io, or a small VPS:

```bash
npm ci
npm run build
npx prisma migrate deploy
npm start          # listens on $PORT, default 3000
```

For Vercel or another serverless host, switch to Postgres: change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma`, point `DATABASE_URL` at your database (Neon, Supabase, Railway), delete `prisma/migrations` and run `npx prisma migrate dev --name init` once locally to regenerate the migration.

Always set `APP_PASSWORD`, `APP_SECRET`, `APP_URL` and use HTTPS in production.

## Project layout

```
prisma/                 database schema, migrations and demo seed
src/lib/vehicles.ts     vehicle classes and order sizing
src/lib/availability.ts driver availability rules
src/lib/routing/        Google Routes + fallback estimates, slot-aware ordering, ETA maths
src/lib/planner/        "Plan my day" heuristic
src/lib/currentrms/     Current RMS API client, opportunity-to-job mapping, demo orders
src/lib/google/         Google Calendar
src/lib/email/          mailer and email templates
src/lib/services/       business operations (runs, jobs, sync, driver actions)
src/app/(dispatch)/     office screens
src/app/driver/         driver's phone view
src/app/api/            JSON endpoints used by the board and the driver view
tests/                  unit tests
docs/RECOMMENDATIONS.md ideas for what to add next
```

## Notes on accuracy

* Current RMS accounts differ. The importer reads the standard fields defensively and everything it imports can be corrected on the job page. If your account stores contacts, delivery addresses or product sizes somewhere unusual, adjust `src/lib/currentrms/mapper.ts` (it is small and has no side effects).
* Sizing is an estimate. Products with no dimensions in Current get the defaults from Settings; the app remembers sizes per product so they only need correcting once (see the `ProductProfile` table).
* Routing without a Google key is a straight-line estimate and should be treated as a rough plan.
