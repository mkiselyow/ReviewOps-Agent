import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import UserSwitcher from "@/components/UserSwitcher";
import ManagerPassphraseLogin from "@/components/ManagerPassphraseLogin";
import { listDemoUsers, getUserById } from "@/server/services/hrisService";
import { getCurrentUser } from "@/server/auth/mockSession";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ manager?: string | string[] }>;
}) {
  // Already logged in → go to the dashboard instead of showing the login UI.
  if (await getCurrentUser()) redirect("/manager");

  // The real-manager passphrase form is hidden by default so it doesn't distract
  // demo/judge users. Reveal it only via `/login?manager` (bookmark this URL).
  const showManagerLogin = (await searchParams)?.manager !== undefined;

  // Only demo/test users appear in the one-click switcher. Real users are
  // hidden and sign in via the passphrase form below.
  const users = await Promise.all(
    (await listDemoUsers()).map(async (u) => ({
      id: u.id,
      displayName: u.displayName,
      roleTitle: u.roleTitle,
      managerName: u.managerId
        ? (await getUserById(u.managerId))?.displayName ?? null
        : null,
    })),
  );

  return (
    <Layout user={null}>
      <div className="card">
        <h2>Mock login</h2>
        <p className="muted small">
          Select a demo user. This is a stand-in for real SSO — every sensitive
          action is still enforced by server-side permission checks. All demo
          data is synthetic.
        </p>
      </div>
      <UserSwitcher users={users} />
      {showManagerLogin && <ManagerPassphraseLogin />}
    </Layout>
  );
}
