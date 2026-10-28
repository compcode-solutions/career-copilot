import type { PrismaClient } from "@/generated/prisma/client";
import { delegateName, OWNED_MODELS } from "@/lib/db/owned-models";
import { scopeClient } from "@/lib/db/scoped";

/** The ids of one user's rows, per owned model. */
export type Fixture = { userId: string; ids: Record<string, string[]> };

type Delegate = {
  findMany: (args: object) => Promise<{ id: string }[]>;
};

export const delegate = (client: unknown, model: string) =>
  (client as Record<string, Delegate>)[delegateName(model)];

/** Creates a verified account. */
export async function createUser(db: PrismaClient, name: string): Promise<string> {
  const user = await db.user.create({
    data: { id: `user-${name}`, name, email: `${name}@example.test`, emailVerified: true },
  });
  return user.id;
}

/**
 * Gives `userId` at least one row of every owned model, written through that
 * user's scoped client with nested creates, as the app does. The collisions
 * ADR 0002 asks for (both users with the same company and document kind) are
 * built in: fixtures for A and B are identical apart from the owner.
 */
export async function createFixture(db: PrismaClient, userId: string): Promise<Fixture> {
  const scoped = scopeClient(db, userId);
  await scoped.application.create({
    data: {
      company: "Figma",
      events: { create: { from: "DRAFT", to: "SENT" } },
      documents: { create: { kind: "RESUME", units: [], versions: { create: { units: [], cause: "WRITTEN" } } } },
      messages: { create: { role: "USER", text: "Shorter, please" } },
      notes: { create: { body: "Private note" } },
      jobs: { create: { type: "extract-posting", input: {} } },
    },
  });
  const ids: Record<string, string[]> = {};
  for (const { model } of OWNED_MODELS) {
    ids[model] = (await delegate(db, model).findMany({ where: { userId }, select: { id: true } })).map(({ id }) => id);
  }
  return { userId, ids };
}

/**
 * The smallest valid create for each owned child, pointing at `parentId`:
 * used to try attaching a row to another user's parent.
 */
export const CHILD_DATA: Record<string, (parentId: string) => object> = {
  StatusEvent: (applicationId) => ({ applicationId, from: "DRAFT", to: "SENT" }),
  Document: (applicationId) => ({ applicationId, kind: "COVER_LETTER", units: [] }),
  DocumentVersion: (documentId) => ({ documentId, units: [], cause: "WRITTEN" }),
  ChatMessage: (applicationId) => ({ applicationId, role: "USER", text: "Hi" }),
  Note: (applicationId) => ({ applicationId, body: "Mine now" }),
  Job: (applicationId) => ({ applicationId, type: "extract-posting", input: {} }),
};
