import { z } from "zod";
import { requireCurrentUser } from "@/server/auth/mockSession";
import { orchestrateEvidenceSubmission } from "@/server/agents/orchestrator";
import { logAudit } from "@/server/services/auditService";
import { currentPeriod } from "@/server/utils/dates";
import { toErrorResponse, ok } from "@/server/http";
import { RESPONSE_VISIBILITY } from "@/server/db/schema";

const bodySchema = z.object({
  text: z.string().min(1, "Evidence text is required"),
  period: z.string().optional(),
  visibility: z.enum(RESPONSE_VISIBILITY).optional(),
});

/** An employee submits a piece of evidence directly (standalone flow). */
export async function POST(req: Request) {
  let actorId: string | null = null;
  try {
    const user = await requireCurrentUser();
    actorId = user.id;
    const body = bodySchema.parse(await req.json());

    const result = await orchestrateEvidenceSubmission(user.id, {
      text: body.text,
      period: body.period ?? currentPeriod(),
      visibility: body.visibility,
    });

    logAudit({
      actorId: user.id,
      action: "evidence_submitted",
      resourceType: "evidence",
      resourceId: result.evidence.id,
      metadata: {
        status: result.evidence.status,
        quality: result.validation.qualityScore,
      },
    });
    return ok(result, 201);
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
