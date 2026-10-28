import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { claimInstall } from "./claim-install";

const db = createTestClient();

/** Rows from the single-password era: no owner. */
async function legacyData() {
  await db.application.create({
    data: {
      company: "Ledgerly",
      events: { create: { from: "DRAFT", to: "SENT" } },
      documents: { create: { kind: "RESUME", units: [], versions: { create: { units: [], cause: "WRITTEN" } } } },
      messages: { create: { role: "AI", text: "Hi" } },
      notes: { create: { body: "Private" } },
      jobs: { create: { type: "extract-posting", input: {} } },
    },
  });
  await db.job.create({ data: { type: "zip-pdfs", input: {} } });
}

const owner = (emailVerified = true) =>
  db.user.create({ data: { id: "owner", name: "Owner", email: "owner@example.test", emailVerified } });

beforeEach(async () => {
  await resetDatabase(db);
  await legacyData();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("claimInstall", () => {
  it("gives every unowned row to the only account, parents first, and is idempotent", async () => {
    await owner();
    const first = await claimInstall(db, " Owner@Example.test ");
    expect(first).toEqual({
      userId: "owner",
      claimed: { Application: 1, StatusEvent: 1, Document: 1, DocumentVersion: 1, ChatMessage: 1, Note: 1, Job: 2 },
    });
    for (const count of [
      db.application.count({ where: { userId: null } }),
      db.documentVersion.count({ where: { userId: null } }),
      db.job.count({ where: { userId: null } }),
    ]) {
      expect(await count).toBe(0);
    }
    const second = await claimInstall(db, "owner@example.test");
    expect(Object.values(second.claimed).every((count) => count === 0)).toBe(true);
  });

  it("refuses before anyone has signed in", async () => {
    await expect(claimInstall(db, "owner@example.test")).rejects.toThrow("No account exists yet");
  });

  it("refuses when more than one account exists", async () => {
    await owner();
    await db.user.create({ data: { id: "other", name: "Other", email: "other@example.test", emailVerified: true } });
    await expect(claimInstall(db, "owner@example.test")).rejects.toThrow("More than one account");
    expect(await db.application.count({ where: { userId: null } })).toBe(1);
  });

  it("refuses another email, or an unverified one", async () => {
    await owner(false);
    await expect(claimInstall(db, "someone@example.test")).rejects.toThrow("isn't the install's account");
    await expect(claimInstall(db, "owner@example.test")).rejects.toThrow("Verify the account's email");
    expect(await db.note.count({ where: { userId: null } })).toBe(1);
  });
});
