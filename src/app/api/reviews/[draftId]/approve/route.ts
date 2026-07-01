import { z } from "zod";
import { requireManager, toErrorResponse, ok } from "@/server/http";
import {
  approveReviewDraft,
  updateReviewDraftMarkdown,
} from "@/server/services/reviewService";
import { logAudit } from "@/server/services/auditService";

const bodySchema = z.object({ markdown: z.string().optional() });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ draftId: string }> },
) {
  let actorId: string | null = null;
  try {
    const manager = await requireManager();
    actorId = manager.id;
    const { draftId } = await ctx.params;

    const raw = await req.json().catch(() => ({}));
    const body = bodySchema.parse(raw && typeof raw === "object" ? raw : {});

    // Allow the manager to persist edits before approving.
    if (body.markdown && body.markdown.trim().length > 0) {
      await updateReviewDraftMarkdown(manager.id, draftId, body.markdown);
    }

    const approved = await approveReviewDraft(manager.id, draftId);
    logAudit({
      actorId: manager.id,
      action: "review_approved",
      resourceType: "review_draft",
      resourceId: draftId,
    });
    return ok({ draft: approved });
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
