import { z } from "zod";
import { requireManager, toErrorResponse, ok } from "@/server/http";
import { updateQuestionnaireDeadline } from "@/server/services/surveyService";
import { logAudit } from "@/server/services/auditService";

const bodySchema = z.object({ deadline: z.string().nullable() });

/**
 * Edit a questionnaire's response deadline and reopen outstanding survey links.
 * Body: { deadline: "YYYY-MM-DD" | null }. Ownership is enforced in the service.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let actorId: string | null = null;
  try {
    const manager = await requireManager();
    actorId = manager.id;
    const { id } = await ctx.params;

    const raw = await req.json().catch(() => ({}));
    const { deadline } = bodySchema.parse(raw && typeof raw === "object" ? raw : {});
    const normalized = deadline && deadline.trim() ? deadline.trim() : null;

    const result = await updateQuestionnaireDeadline(manager.id, id, normalized);

    logAudit({
      actorId: manager.id,
      action: "deadline_updated",
      resourceType: "questionnaire",
      resourceId: id,
      metadata: { deadline: result.questionnaire.deadline, reopened: result.reopened },
    });

    return ok({ deadline: result.questionnaire.deadline, reopened: result.reopened });
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
