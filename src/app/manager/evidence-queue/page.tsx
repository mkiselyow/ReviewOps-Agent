import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import EvidenceReviewQueue from "@/components/EvidenceReviewQueue";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getDirectReports } from "@/server/services/hrisService";
import { getPendingEvidenceForManager } from "@/server/services/evidenceService";

export const dynamic = "force-dynamic";

export default async function EvidenceQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if ((await getDirectReports(user.id)).length === 0) redirect("/employee");

  const items = (await getPendingEvidenceForManager(user.id)).map((e) => ({
    id: e.id,
    employeeName: e.employeeName,
    sourceText: e.sourceText,
    summary: e.summary,
    impact: e.impact,
    concern: e.concern,
    companyValue: e.companyValue,
    qualityScore: e.qualityScore,
    confidence: e.confidence,
  }));

  return (
    <Layout user={user}>
      <h1 style={{ fontSize: 22 }}>Evidence review queue</h1>
      <div className="card">
        <p className="muted small">
          Lower-confidence evidence your direct reports submitted directly,
          awaiting your approve/reject. Approved evidence becomes usable for
          review drafts.
        </p>
        <EvidenceReviewQueue items={items} />
      </div>
    </Layout>
  );
}
