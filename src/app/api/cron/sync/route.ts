import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { syncJobs } from "@/lib/services/sync";
import { addDays, todayString } from "@/lib/time";

/**
 * Scheduled sync. Call every 15-30 minutes from Vercel Cron, GitHub Actions,
 * cron-job.org or similar with "Authorization: Bearer <CRON_SECRET>".
 */
async function run(req: Request) {
  const secret = config.cronSecret();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const today = todayString();
  const summary = await syncJobs(today, addDays(today, 14));
  return NextResponse.json(summary);
}

export const GET = run;
export const POST = run;
