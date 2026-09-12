import { dateParam, handle } from "@/lib/api";
import { getDayState } from "@/lib/services/runs";

export async function GET(req: Request) {
  const date = dateParam(new URL(req.url).searchParams.get("date"));
  return handle(() => getDayState(date));
}
