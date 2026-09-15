import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Used by the hosting platform to check the app is up and the database is reachable. */
export async function GET() {
  try {
    await prisma.settings.count();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
