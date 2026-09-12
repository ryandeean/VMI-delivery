import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { autoPlanDay, getDayState } from "@/lib/services/runs";

const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, schema);
    const summary = await autoPlanDay(body.date);
    return { summary, state: await getDayState(body.date) };
  });
}
