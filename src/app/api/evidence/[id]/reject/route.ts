import { requireManager, toErrorResponse, ok } from "@/server/http";
import { setEvidenceStatus } from "@/server/services/evidenceService";
import { logAudit } from "@/server/services/auditService";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let actorId: string | null = null;
  try {
    const manager = await requireManager();
    actorId = manager.id;
    const { id } = await ctx.params;
    const evidence = setEvidenceStatus(manager.id, id, "rejected");
    logAudit({
      actorId: manager.id,
      action: "evidence_reviewed",
      resourceType: "evidence",
      resourceId: id,
      metadata: { decision: "rejected" },
    });
    return ok({ evidence });
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
