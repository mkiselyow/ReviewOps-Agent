import { requireManager, toErrorResponse, ok } from "@/server/http";
import { exportReviewMarkdown } from "@/server/services/reviewService";
import { logAudit } from "@/server/services/auditService";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ draftId: string }> },
) {
  let actorId: string | null = null;
  try {
    const manager = await requireManager();
    actorId = manager.id;
    const { draftId } = await ctx.params;

    const result = await exportReviewMarkdown(manager.id, draftId);
    logAudit({
      actorId: manager.id,
      action: "review_exported",
      resourceType: "review_draft",
      resourceId: draftId,
      metadata: { file: result.filePath },
    });
    return ok(result);
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
