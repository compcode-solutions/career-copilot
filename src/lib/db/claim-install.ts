import type { PrismaClient } from "@/generated/prisma/client";
import { delegateName } from "@/lib/db/owned-models";
import { ownedModelsParentsFirst } from "@/lib/db/scoped";

/**
 * Gives every row that has no owner yet to the install's first account
 * (ADR 0002 §4 step 2, BUILD-SPEC Phase 3 task 9). The operator runs it once,
 * on purpose, after signing in for the first time. It refuses when:
 *
 * - no account has that email, or the email isn't verified;
 * - more than one account exists, so data from the single-password era can
 *   never land in a stranger's account by accident.
 *
 * It's idempotent: a second run finds nothing left to claim. Parents are
 * claimed before children, which the owner-check triggers require.
 */
export async function claimInstall(
  db: PrismaClient,
  email: string,
): Promise<{ userId: string; claimed: Record<string, number> }> {
  return db.$transaction(async (tx) => {
    const users = await tx.user.findMany({ select: { id: true, email: true, emailVerified: true }, take: 2 });
    if (users.length !== 1) {
      throw new Error(
        users.length === 0
          ? "No account exists yet. Sign in once, then claim the install."
          : "More than one account exists, so the install can't be claimed automatically.",
      );
    }
    const [user] = users;
    if (user.email.toLowerCase() !== email.trim().toLowerCase()) {
      throw new Error("That email isn't the install's account.");
    }
    if (!user.emailVerified) throw new Error("Verify the account's email before claiming the install.");

    const claimed: Record<string, number> = {};
    for (const entry of ownedModelsParentsFirst()) {
      const delegate = (tx as unknown as Record<string, { updateMany: (args: object) => Promise<{ count: number }> }>)[
        delegateName(entry.model)
      ];
      const { count } = await delegate.updateMany({ where: { userId: null }, data: { userId: user.id } });
      claimed[entry.model] = count;
    }
    return { userId: user.id, claimed };
  });
}
