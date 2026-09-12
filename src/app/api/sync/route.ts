import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { syncJobs } from "@/lib/services/sync";
import { getDayState } from "@/lib/services/runs";
import { addDays, todayString } from "@/lib/time";

const schema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, schema);
    const from = body.from ?? body.date ?? todayString();
    const to = body.to ?? (body.date ? body.date : addDays(from, 7));
    const summary = await syncJobs(from, to);
    return { summary, state: body.date ? await getDayState(body.date) : undefined };
  });
}
