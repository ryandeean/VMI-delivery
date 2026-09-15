import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, loginRequired, verifySessionToken } from "@/lib/auth";

/** Protects the dispatch screens with the shared password. Driver links and cron stay open. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!loginRequired()) return NextResponse.next();
  const open = pathname.startsWith("/login") || pathname.startsWith("/driver") || pathname.startsWith("/api/driver") || pathname.startsWith("/api/cron") || pathname.startsWith("/api/auth") || pathname === "/api/health";
  if (open) return NextResponse.next();
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api")) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|webmanifest)).*)"],
};
