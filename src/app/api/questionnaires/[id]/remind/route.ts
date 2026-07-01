import { requireManager, toErrorResponse, ok } from "@/server/http";
import { sendReminders } from "@/server/services/remindersService";
import { logAudit } from "@/server/services/auditService";

/** Nudge outstanding respondents of a questionnaire (writes reminder rows to the outbox). */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let actorId: string | null = null;
  try {
    const manager = await requireManager();
    actorId = manager.id;
    const { id } = await ctx.params;

    const result = await sendReminders(manager.id, id); // ownership enforced inside

    logAudit({
      actorId: manager.id,
      action: "reminders_sent",
      resourceType: "questionnaire",
      resourceId: id,
      metadata: { sent: result.sent, skipped: result.skipped },
    });

    return ok(result);
  } catch (err) {
    return toErrorResponse(err, actorId);
  }
}
