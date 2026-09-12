import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { assignJob, getDayState } from "@/lib/services/runs";

const schema = z.object({ jobId: z.string(), position: z.number().int().min(0).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const body = await parseBody(req, schema);
    const run = await assignJob(body.jobId, id, body.position);
    return { state: await getDayState(run.date) };
  });
}
