import Nav from "@/components/Nav";
import { loginRequired } from "@/lib/auth";
import { getSettings } from "@/lib/services/settings";

export default async function DispatchLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <>
      <Nav companyName={settings.companyName} showLogout={loginRequired()} />
      <main className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-4">{children}</main>
    </>
  );
}
