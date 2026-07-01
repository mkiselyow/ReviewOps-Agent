import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import ReviewDraftViewer from "@/components/ReviewDraftViewer";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getReviewDraft } from "@/server/services/reviewService";

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

  return (
    <Layout user={user}>
      <ReviewDraftViewer
        draftId={draft.id}
        initialMarkdown={draft.draftMarkdown}
        initialStatus={draft.status}
        fairness={fairness}
        grounding={grounding}
      />
    </Layout>
  );
}
