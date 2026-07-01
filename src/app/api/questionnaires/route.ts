import { z } from "zod";
import { requireManager, toErrorResponse, ok } from "@/server/http";
import { orchestrateQuestionnaireGeneration } from "@/server/agents/orchestrator";
import { logAudit } from "@/server/services/auditService";

const bodySchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  purpose: z.string().optional(),
  period: z.string().min(1, "Period is required"),
  deadline: z.string().optional(),
  roleTitle: z.string().optional(),
  notes: z.string().optional(),
  evidenceValidation: z.boolean().optional(),
});

export async function POST(req: Request) {
  let actorId: string | null = null;
  try {
    const manager = await requireManager();
    actorId = manager.id;
    const body = bodySchema.parse(await req.json());

    const result = await orchestrateQuestionnaireGeneration(manager.id, body);

    logAudit({
      actorId: manager.id,
      action: "questionnaire_created",
      resourceType: "questionnaire",
      resourceId: result.questionnaire.id,
      metadata: { source: result.source, safety: result.safety.decision },
    });

    return ok(result, 201);
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
