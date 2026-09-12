import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { getDayState, notifyClients } from "@/lib/services/runs";
import { prisma } from "@/lib/db";

const schema = z.object({ force: z.boolean().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const body = await parseBody(req, schema);
    const run = await prisma.run.findUniqueOrThrow({ where: { id } });
    const result = await notifyClients(id, { force: body.force });
    return { emails: result.emails, state: await getDayState(run.date) };
  });
}
