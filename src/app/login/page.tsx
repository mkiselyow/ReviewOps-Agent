import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import UserSwitcher from "@/components/UserSwitcher";
import { listAllUsers, getUserById } from "@/server/services/hrisService";
import { getCurrentUser } from "@/server/auth/mockSession";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already logged in → go to the dashboard instead of showing the login UI.
  if (await getCurrentUser()) redirect("/manager");

  const users = listAllUsers().map((u) => ({
    id: u.id,
    displayName: u.displayName,
    roleTitle: u.roleTitle,
    managerName: u.managerId ? getUserById(u.managerId)?.displayName ?? null : null,
  }));

  return (
    <Layout user={null}>
      <div className="card">
        <h2>Mock login</h2>
        <p className="muted small">
          Select a demo user. This is a stand-in for real SSO — every sensitive
          action is still enforced by server-side permission checks. All data is
          synthetic.
        </p>
      </div>
      <UserSwitcher users={users} />
    </Layout>
  );
}
