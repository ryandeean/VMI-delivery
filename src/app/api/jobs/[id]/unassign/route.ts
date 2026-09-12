import { handle } from "@/lib/api";
import { getDayState, unassignJob } from "@/lib/services/runs";
import { prisma } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const job = await prisma.job.findUniqueOrThrow({ where: { id } });
    await unassignJob(id);
    return { state: await getDayState(job.date) };
  });
}
