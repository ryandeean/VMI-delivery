import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, checkPassword, loginRequired, makeSessionToken } from "@/lib/auth";
import { getSettings } from "@/lib/services/settings";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (!loginRequired()) redirect("/");
  const settings = await getSettings();

  async function login(formData: FormData) {
    "use server";
    const password = String(formData.get("password") ?? "");
    const target = String(formData.get("next") ?? "/") || "/";
    if (!checkPassword(password)) redirect(`/login?error=1&next=${encodeURIComponent(target)}`);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, await makeSessionToken(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86400, secure: process.env.NODE_ENV === "production" });
    redirect(target.startsWith("/") ? target : "/");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form action={login} className="card w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">{settings.companyName} Deliveries</h1>
          <p className="text-sm text-slate-500">Enter the team password to open the dispatch board.</p>
        </div>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">That password is not right. Try again.</p>}
        <input type="hidden" name="next" value={next ?? "/"} />
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" autoFocus required />
        </div>
        <button className="btn-primary w-full" type="submit">Log in</button>
      </form>
    </main>
  );
}
