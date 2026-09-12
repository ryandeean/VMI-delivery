import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { arrived, completeStop, onMyWay, reportProblem, startRun, undoStop } from "@/lib/services/driverActions";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), runId: z.string() }),
  z.object({ action: z.literal("onMyWay"), jobId: z.string() }),
  z.object({ action: z.literal("arrived"), jobId: z.string() }),
  z.object({ action: z.literal("complete"), jobId: z.string(), podName: z.string().optional(), notes: z.string().optional() }),
  z.object({ action: z.literal("problem"), jobId: z.string(), message: z.string().min(1), markFailed: z.boolean().optional() }),
  z.object({ action: z.literal("undo"), jobId: z.string() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handle(async () => {
    const body = await parseBody(req, schema);
    switch (body.action) {
      case "start":
        return startRun(token, body.runId);
      case "onMyWay":
        return onMyWay(token, body.jobId);
      case "arrived":
        await arrived(token, body.jobId);
        return { ok: true };
      case "complete":
        return completeStop(token, body.jobId, { podName: body.podName, notes: body.notes });
      case "problem":
        return reportProblem(token, body.jobId, body.message, Boolean(body.markFailed));
      case "undo":
        await undoStop(token, body.jobId);
        return { ok: true };
    }
  });
}
