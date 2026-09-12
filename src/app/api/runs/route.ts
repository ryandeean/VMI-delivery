import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { createRun, getDayState } from "@/lib/services/runs";

const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), driverId: z.string().nullable().optional(), vehicleId: z.string().nullable().optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, schema);
    const run = await createRun(body.date, body.driverId, body.vehicleId);
    return { runId: run.id, state: await getDayState(body.date) };
  });
}
