import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { isValidDateString, todayString } from "./time";

/** Uniform JSON error handling for route handlers. */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
    const message = (e as Error).message || "Something went wrong";
    const status = /not found/i.test(message) ? 404 : /not valid|cannot|before|choose|different day|finished/i.test(message) ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const raw = await req.json().catch(() => ({}));
  return schema.parse(raw);
}

export function dateParam(value: string | null | undefined): string {
  return isValidDateString(value) ? value : todayString();
}
