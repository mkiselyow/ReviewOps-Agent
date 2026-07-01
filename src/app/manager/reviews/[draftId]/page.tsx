import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import ReviewDraftViewer from "@/components/ReviewDraftViewer";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getReviewDraft } from "@/server/services/reviewService";
import {
  getUserById,
  getRoleExpectations,
  getCompanyValues,
} from "@/server/services/hrisService";

export const dynamic = "force-dynamic";

type FairnessReport = {
  grounded: boolean;
  warnings: { type: string; message: string; severity: "low" | "medium" | "high" }[];
  unsupportedClaims: number;
  citedEvidence: string[];
};
type GroundingReport = {
  removedCategories: string[];
  evidenceCount: number;
  source: string;
};

export default async function ReviewDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { draftId } = await params;

  const draft = await getReviewDraft(draftId);
  if (!draft || draft.managerId !== user.id) {
    return (
      <Layout user={user}>
        <div className="note bad">Review draft not found or not accessible.</div>
      </Layout>
    );
  }

  const fairness: FairnessReport = draft.fairnessReportJson
    ? JSON.parse(draft.fairnessReportJson)
    : { grounded: false, warnings: [], unsupportedClaims: 0, citedEvidence: [] };
  const grounding: GroundingReport = draft.groundingReportJson
    ? JSON.parse(draft.groundingReportJson)
    : { removedCategories: [], evidenceCount: 0, source: "mock" };

  // Grounding reference for a fair review: the role expectations + company values
  // the draft is calibrated against, shown alongside it in one place.
  const employee = await getUserById(draft.employeeId);
  const roleExpectations = employee ? getRoleExpectations(employee.roleTitle) : [];
  const companyValues = getCompanyValues();

  return (
    <Layout user={user}>
      <ReviewDraftViewer
        draftId={draft.id}
        initialMarkdown={draft.draftMarkdown}
        initialStatus={draft.status}
        fairness={fairness}
        grounding={grounding}
      />

      <details className="card">
        <summary className="small muted">
          Grounding reference — role expectations &amp; company values
        </summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <div>
            <h3 style={{ margin: "0 0 6px" }}>
              Role expectations{employee ? ` · ${employee.roleTitle}` : ""}
            </h3>
            {roleExpectations.length > 0 ? (
              <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
                {roleExpectations.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No role expectations on file.</p>
            )}
          </div>
          <div>
            <h3 style={{ margin: "10px 0 6px" }}>Company values</h3>
            <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
              {companyValues.map((v) => (
                <li key={v.name}>
                  <strong>{v.name}</strong>
                  {v.description ? ` — ${v.description}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </Layout>
  );
}
