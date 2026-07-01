import { z } from "zod";
import { requireManager, toErrorResponse, ok } from "@/server/http";
import {
  approveQuestionnaire,
  createSurveyAssignments,
} from "@/server/services/surveyService";
import { getDirectReports } from "@/server/services/hrisService";
import { logAudit } from "@/server/services/auditService";

const bodySchema = z.object({ respondentIds: z.array(z.string()).optional() });

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
    const body = bodySchema.parse(raw && typeof raw === "object" ? raw : {});

    // Approve (ownership checked inside the service).
    await approveQuestionnaire(manager.id, id);
    logAudit({
      actorId: manager.id,
      action: "questionnaire_approved",
      resourceType: "questionnaire",
      resourceId: id,
    });

    // Default recipients: all direct reports.
    const respondentIds =
      body.respondentIds && body.respondentIds.length > 0
        ? body.respondentIds
        : (await getDirectReports(manager.id)).map((u) => u.id);

    const links = await createSurveyAssignments(manager.id, id, respondentIds);
    logAudit({
      actorId: manager.id,
      action: "assignments_created",
      resourceType: "questionnaire",
      resourceId: id,
      metadata: { count: links.length },
    });

    return ok({ questionnaireId: id, links }, 201);
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
