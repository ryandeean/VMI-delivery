import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { getDayState, publishRun } from "@/lib/services/runs";

const schema = z.object({ emailClients: z.boolean().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const body = await parseBody(req, schema);
    const result = await publishRun(id, { emailClients: body.emailClients });
    return { calendar: result.calendar, emails: result.emails, warnings: result.warnings, state: await getDayState(result.run.date) };
  });
}
