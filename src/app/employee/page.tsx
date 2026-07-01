import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import AddEvidenceForm from "@/components/AddEvidenceForm";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getDirectReports } from "@/server/services/hrisService";
import { getOwnEvidence } from "@/server/services/evidenceService";
import { currentPeriod } from "@/server/utils/dates";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  approved: "good",
  auto_approved: "good",
  pending_review: "warn",
  rejected: "bad",
  draft: "",
};

export default async function EmployeePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if ((await getDirectReports(user.id)).length > 0) redirect("/manager");

  const evidence = await getOwnEvidence(user.id);

  return (
    <Layout user={user}>
      <h1 style={{ fontSize: 22 }}>My evidence — {user.displayName}</h1>
      <AddEvidenceForm defaultPeriod={currentPeriod()} />

      <div className="card">
        <h2>Submitted evidence</h2>
        {evidence.length === 0 ? (
          <p className="muted small">No evidence yet — add your first above.</p>
        ) : (
          <div className="stack">
            {evidence.map((e) => (
              <div key={e.id} className="note">
                <div className="spread">
                  <span className={`badge ${STATUS_CLASS[e.status] ?? ""}`}>
                    {e.status.replace(/_/g, " ")}
                  </span>
                  {e.qualityScore != null && (
                    <span className="badge">quality {e.qualityScore.toFixed(2)}</span>
                  )}
                </div>
                <div style={{ marginTop: 6 }}>{e.summary}</div>
                {e.impact && (
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Impact: {e.impact}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
