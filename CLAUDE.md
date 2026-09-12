# VMI Deliveries

Next.js 16 (App Router, TypeScript, Tailwind v4) + Prisma 6 on SQLite. Delivery/collection scheduling for a camera hire company using Current RMS.

- `npm run dev` to run, `npm test` for unit tests (vitest), `npm run lint`, `npm run typecheck`, `npm run build`.
- Pure logic lives in `src/lib` (routing, planner, vehicles, mapper) and is unit tested; database operations live in `src/lib/services`.
- Integrations (Current RMS, Google Routes/Geocoding, Google Calendar, SMTP) all degrade gracefully when their env vars are missing; keep it that way.
- Dates: instants are stored as UTC `DateTime`; the job `date` column is a "YYYY-MM-DD" string in the company timezone. Use helpers in `src/lib/time.ts` (never locale-dependent formatting in client components; server and browser ICU differ).
- Server actions files (`actions.ts`) may only export async functions.
- No em dashes in copy or comments.
