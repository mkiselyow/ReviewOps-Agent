import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import AuditLogTable from "@/components/AuditLogTable";
import { getCurrentUser } from "@/server/auth/mockSession";
import { listAudit } from "@/server/services/auditService";
import { getUserById } from "@/server/services/hrisService";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = listAudit(200).map((log) => ({
    id: log.id,
    createdAt: log.createdAt,
    actorName:
      log.actorId === "system"
        ? "system"
        : (log.actorId ? getUserById(log.actorId)?.displayName : null) ??
          log.actorId ??
          "—",
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
  }));

  return (
    <Layout user={user}>
      <h1 style={{ fontSize: 22 }}>Audit log</h1>
      <div className="card">
        <p className="muted small">
          Sensitive actions are recorded, including denied access attempts.
        </p>
        <AuditLogTable rows={rows} />
      </div>
    </Layout>
  );
}
