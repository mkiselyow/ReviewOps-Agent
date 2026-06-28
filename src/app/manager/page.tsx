import Link from "next/link";
import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import DirectReportsList from "@/components/DirectReportsList";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getDirectReports } from "@/server/services/hrisService";
import { listQuestionnairesByManager } from "@/server/services/surveyService";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  draft: "",
  approved: "warn",
  sent: "good",
  closed: "",
};

export default async function ManagerDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reports = getDirectReports(user.id);
  const questionnaires = listQuestionnairesByManager(user.id);

  return (
    <Layout user={user}>
      <div className="spread" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Manager dashboard</h1>
        <Link className="btn" href="/manager/questionnaires/new">
          + Create questionnaire
        </Link>
      </div>

      <div className="card">
        <h2>Your direct reports</h2>
        <DirectReportsList
          reports={reports.map((r) => ({
            id: r.id,
            displayName: r.displayName,
            roleTitle: r.roleTitle,
          }))}
        />
      </div>

      <div className="card">
        <h2>Questionnaires</h2>
        {questionnaires.length === 0 ? (
          <p className="muted small">
            No questionnaires yet. Create one to collect evidence from your team.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Period</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {questionnaires.map((q) => (
                <tr key={q.id}>
                  <td>{q.title}</td>
                  <td className="muted">{q.period}</td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[q.status] ?? ""}`}>
                      {q.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/manager/questionnaires/${q.id}/preview`}>
                      Preview
                    </Link>
                    {" · "}
                    <Link href={`/manager/questionnaires/${q.id}/results`}>
                      Results
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
