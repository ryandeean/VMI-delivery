import { handle } from "@/lib/api";
import { getDayState, optimiseRun } from "@/lib/services/runs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { run, warnings } = await optimiseRun(id);
    return { warnings, state: await getDayState(run.date) };
  });
}
