import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { getDayState, reorderRun } from "@/lib/services/runs";

const schema = z.object({ jobIds: z.array(z.string()) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const body = await parseBody(req, schema);
    const run = await reorderRun(id, body.jobIds);
    return { state: await getDayState(run.date) };
  });
}
