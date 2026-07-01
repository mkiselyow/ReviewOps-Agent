import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import ReviewGenerateForm from "@/components/ReviewGenerateForm";
import EvidenceCard from "@/components/EvidenceCard";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getUserById } from "@/server/services/hrisService";
import { getEmployeeEvidence } from "@/server/services/evidenceService";
import { canManagerViewEmployee } from "@/server/auth/permissions";
import { currentPeriod } from "@/server/utils/dates";

export const dynamic = "force-dynamic";

export default async function NewReviewPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { employeeId } = await params;

  const employee = await getUserById(employeeId);
  if (!employee || !canManagerViewEmployee(user.id, employee)) {
    return (
      <Layout user={user}>
        <div className="note bad">
          You can only generate reviews for your direct reports.
        </div>
      </Layout>
    );
  }

  // All non-private evidence on file for this report (any status), so the
  // manager can see what exists before generating a review.
  const evidence = await getEmployeeEvidence(user.id, employee.id);

  return (
    <Layout user={user}>
      <ReviewGenerateForm
        employeeId={employee.id}
        employeeName={employee.displayName}
        defaultPeriod={currentPeriod()}
      />

      <div className="card">
        <h2>Evidence on file — {employee.displayName}</h2>
        <p className="muted small">
          Everything {employee.displayName.split(" ")[0]} submitted or that was
          collected. Only <strong>review-approved</strong> items ground the draft;
          pending items need your approval in the evidence queue first.
        </p>
        {evidence.length === 0 ? (
          <p className="muted small">No evidence on file yet.</p>
        ) : (
          <div className="stack">
            {evidence.map((e) => (
              <EvidenceCard
                key={e.id}
                evidence={{
                  id: e.id,
                  summary: e.summary,
                  impact: e.impact,
                  companyValue: e.companyValue,
                  qualityScore: e.qualityScore,
                  visibility: e.visibility,
                  status: e.status,
                  sourceText: e.sourceText,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
