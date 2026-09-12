import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { config } from "@/lib/config";

export async function POST() {
  const res = NextResponse.redirect(new URL("/login", config.appUrl()), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
