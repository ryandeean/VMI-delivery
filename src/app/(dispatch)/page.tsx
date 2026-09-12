import DayBoard from "@/components/DayBoard";
import { dateParam } from "@/lib/api";
import { getDayState } from "@/lib/services/runs";

export const dynamic = "force-dynamic";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const day = dateParam(date);
  const state = await getDayState(day);
  return <DayBoard key={day} initial={state} />;
}
