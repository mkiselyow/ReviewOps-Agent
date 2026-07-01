import { z } from "zod";
import {
  requireManager,
  assertAgentRateLimit,
  toErrorResponse,
  ok,
} from "@/server/http";
import { orchestrateQuestionnaireRegeneration } from "@/server/agents/orchestrator";
import { logAudit } from "@/server/services/auditService";

const bodySchema = z.object({ feedback: z.string().trim().min(1).max(4000) });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let actorId: string | null = null;
  try {
    const manager = await requireManager();
    actorId = manager.id;
    assertAgentRateLimit(manager.id);
    const { id } = await ctx.params;

    const raw = await req.json().catch(() => ({}));
    const { feedback } = bodySchema.parse(raw && typeof raw === "object" ? raw : {});

    // Ownership + draft-status enforced inside the orchestrator/service.
    const result = await orchestrateQuestionnaireRegeneration(manager.id, id, feedback);

    logAudit({
      actorId: manager.id,
      action: "questionnaire_regenerated",
      resourceType: "questionnaire",
      resourceId: id,
      metadata: { questionCount: result.questions.length },
    });

    return ok({
      questionnaire: result.questionnaire,
      questionCount: result.questions.length,
    });
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
