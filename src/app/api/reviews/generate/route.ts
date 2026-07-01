import { z } from "zod";
import {
  requireManager,
  assertAgentRateLimit,
  toErrorResponse,
  ok,
} from "@/server/http";
import { orchestrateReviewGeneration } from "@/server/agents/orchestrator";
import { logAudit } from "@/server/services/auditService";

const bodySchema = z.object({
  employeeId: z.string().min(1),
  period: z.string().min(1),
});

export async function POST(req: Request) {
  let actorId: string | null = null;
  try {
    const manager = await requireManager();
    actorId = manager.id;
    assertAgentRateLimit(manager.id);
    const { employeeId, period } = bodySchema.parse(await req.json());

    const result = await orchestrateReviewGeneration(manager.id, employeeId, period);

    logAudit({
      actorId: manager.id,
      action: "review_draft_generated",
      resourceType: "review_draft",
      resourceId: result.draft.id,
      metadata: {
        grounded: result.fairness.grounded,
        warnings: result.fairness.warnings.length,
        evidenceCount: result.grounding.evidenceCount,
      },
    });

    return ok(result, 201);
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
