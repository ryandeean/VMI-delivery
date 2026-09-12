import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { getDayState } from "@/lib/services/runs";
import { JOB_STATUSES, setJobStatus } from "@/lib/services/jobs";

const schema = z.object({ status: z.enum(JOB_STATUSES) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const body = await parseBody(req, schema);
    const job = await setJobStatus(id, body.status);
    return { state: await getDayState(job.date) };
  });
}
