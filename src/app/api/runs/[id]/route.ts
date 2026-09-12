import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { deleteRun, getDayState, updateRun } from "@/lib/services/runs";
import { prisma } from "@/lib/db";

const schema = z.object({
  driverId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  startLocked: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const body = await parseBody(req, schema);
    const run = await updateRun(id, body);
    return { state: await getDayState(run.date) };
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const run = await prisma.run.findUniqueOrThrow({ where: { id } });
    await deleteRun(id);
    return { state: await getDayState(run.date) };
  });
}
