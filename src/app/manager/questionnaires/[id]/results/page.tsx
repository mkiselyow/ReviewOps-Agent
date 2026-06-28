import Link from "next/link";
import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import EvidenceCard from "@/components/EvidenceCard";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getQuestionnaireResults } from "@/server/services/surveyService";
import { PermissionError, NotFoundError } from "@/server/auth/permissions";

export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  let results;
  try {
    results = getQuestionnaireResults(user.id, id);
  } catch (err) {
    if (err instanceof PermissionError || err instanceof NotFoundError) {
      return (
        <Layout user={user}>
          <div className="note bad">{err.message}</div>
        </Layout>
      );
    }
    throw err;
  }

  return (
    <Layout user={user}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>
          Results · {results.questionnaire.title}
        </h1>
        <span className="badge">{results.questionnaire.period}</span>
      </div>

      {results.respondents.length === 0 && (
        <div className="card muted">
          No assignments yet. Approve the questionnaire to send links.
        </div>
      )}

      {results.respondents.map((r) => (
        <div key={r.respondentId} className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>{r.respondentName}</h2>
            <div className="row">
              <span
                className={`badge ${r.status === "submitted" ? "good" : "warn"}`}
              >
                {r.status}
              </span>
              {r.averageQuality != null && (
                <span className="badge">
                  avg quality {r.averageQuality.toFixed(2)}
                </span>
              )}
              {r.weakEvidenceCount > 0 && (
                <span className="badge bad">
                  {r.weakEvidenceCount} weak
                </span>
              )}
            </div>
          </div>

          {r.mappedValues.length > 0 && (
            <p className="small muted" style={{ marginTop: 6 }}>
              Mapped values: {r.mappedValues.join(", ")}
            </p>
          )}

          {r.evidence.length === 0 ? (
            <p className="muted small">No evidence submitted yet.</p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {r.evidence.map((e) => (
                <EvidenceCard
                  key={e.id}
                  evidence={{
                    id: e.id,
                    summary: e.summary,
                    impact: e.impact,
                    companyValue: e.companyValue,
                    qualityScore: e.qualityScore,
                    visibility: e.visibility,
                  }}
                />
              ))}
            </div>
          )}

          {r.responses.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary className="small muted">
                Question responses ({r.responses.length})
              </summary>
              <div className="stack" style={{ marginTop: 8 }}>
                {r.responses.map((resp) => {
                  const q = results.questions.find((x) => x.id === resp.questionId);
                  return (
                    <div key={resp.id} className="note small">
                      <div className="muted">
                        {q ? `${q.position + 1}. ${q.text}` : "Question"}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        {resp.answerText || <em>(no answer)</em>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          <p className="small" style={{ marginTop: 10 }}>
            <Link
              className="btn btn-ghost"
              href={`/manager/reviews/new/${r.respondentId}`}
            >
              Generate review draft
            </Link>
          </p>
        </div>
      ))}
    </Layout>
  );
}
