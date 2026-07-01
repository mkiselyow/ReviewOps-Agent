import { z } from "zod";
import { toErrorResponse, ok } from "@/server/http";
import { orchestrateResponseSubmission } from "@/server/agents/orchestrator";
import { getAssignmentByToken } from "@/server/services/surveyService";
import { logAudit } from "@/server/services/auditService";
import { RESPONSE_VISIBILITY } from "@/server/db/schema";

const bodySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        answerText: z.string(),
        visibility: z.enum(RESPONSE_VISIBILITY).optional(),
      }),
    )
    .min(1),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    // Respondent identity is derived from the token inside the orchestrator;
    // never trust an id from the request body.
    const result = await orchestrateResponseSubmission(token, body.answers);

    const assignment = await getAssignmentByToken(token);
    logAudit({
      actorId: assignment?.respondentId ?? null,
      action: "response_submitted",
      resourceType: "assignment",
      resourceId: assignment?.id ?? null,
      metadata: { validated: result.validations.length },
    });
    for (const v of result.validations) {
      logAudit({
        actorId: assignment?.respondentId ?? null,
        action: "evidence_validated",
        resourceType: "response",
        resourceId: v.responseId,
        metadata: { quality: v.validation.qualityScore, weak: v.validation.isWeak },
      });
    }

    return ok(result, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
