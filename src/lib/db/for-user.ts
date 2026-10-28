import "server-only";

import { scopeClient, type ScopedClient } from "@/lib/db/scoped";
import { prisma } from "@/lib/prisma";

/**
 * The database as one user sees it (ADR 0002). `userId` must come from the
 * server session, never from input. Request handlers get this as `ctx.db`
 * once `action()` and `route()` carry a user (Phase 3 slice 3).
 */
export function forUser(userId: string): ScopedClient {
  return scopeClient(prisma, userId);
}
