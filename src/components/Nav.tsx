"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today's board" },
  { href: "/jobs", label: "Jobs" },
  { href: "/drivers", label: "Drivers" },
  { href: "/fleet", label: "Vehicles" },
  { href: "/notifications", label: "Emails sent" },
  { href: "/settings", label: "Settings" },
];

export default function Nav({ companyName, showLogout }: { companyName: string; showLogout: boolean }) {
  const pathname = usePathname();
  return (
    <header className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <Link href="/" className="text-base font-bold tracking-tight">
          {companyName} <span className="font-normal text-slate-300">Deliveries</span>
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={`rounded-md px-3 py-1.5 ${active ? "bg-white/15 font-semibold" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        {showLogout && (
          <form action="/api/auth/logout" method="post" className="ml-auto">
            <button className="text-sm text-slate-300 hover:text-white">Log out</button>
          </form>
        )}
      </div>
    </header>
  );
}
