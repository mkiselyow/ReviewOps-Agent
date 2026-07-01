import { z } from "zod";
import { setSessionUserId, clearSession } from "@/server/auth/mockSession";
import { getUserById } from "@/server/services/hrisService";
import { logAudit } from "@/server/services/auditService";
import { NotFoundError } from "@/server/auth/permissions";
import { toErrorResponse, ok } from "@/server/http";

const bodySchema = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { userId } = bodySchema.parse(await req.json());
    const user = await getUserById(userId);
    if (!user) throw new NotFoundError("User not found");

    await setSessionUserId(user.id);
    logAudit({
      actorId: user.id,
      action: "login",
      resourceType: "user",
      resourceId: user.id,
    });
    return ok({ id: user.id, displayName: user.displayName, roleTitle: user.roleTitle });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  await clearSession();
  return ok({ ok: true });
}
