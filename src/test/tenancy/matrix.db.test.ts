/**
 * The cross-tenant test matrix (ADR 0002, Phase 3 acceptance, "do not waive").
 * For every owned model, user B's scoped client must read none of A's rows,
 * update and delete none of them, and fail to attach a row to A's parent.
 * Models join the matrix by joining OWNED_MODELS; the last test fails if a
 * table gets an owner column without joining it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { delegateName, OWNED_MODELS } from "@/lib/db/owned-models";
import { OwnershipError, scopeClient } from "@/lib/db/scoped";
import { createTestClient, resetDatabase } from "@/test/db";

import { CHILD_DATA, createFixture, createUser, type Fixture } from "./fixtures";

const db = createTestClient();
let a: Fixture;
let b: Fixture;

type AnyDelegate = Record<string, (args: object) => Promise<unknown>>;
const as = (fixture: Fixture, model: string) =>
  (scopeClient(db, fixture.userId) as unknown as Record<string, AnyDelegate>)[delegateName(model)];
const raw = (model: string) => (db as unknown as Record<string, AnyDelegate>)[delegateName(model)];

beforeEach(async () => {
  await resetDatabase(db);
  a = await createFixture(db, await createUser(db, "a"));
  b = await createFixture(db, await createUser(db, "b"));
});

afterAll(async () => {
  await db.$disconnect();
});

describe.each(OWNED_MODELS.map(({ model }) => model))("%s", (model) => {
  const aIds = () => a.ids[model];

  it("has rows for both users, owned through nested creates", () => {
    expect(aIds().length).toBeGreaterThan(0);
    expect(b.ids[model].length).toBeGreaterThan(0);
  });

  it("lets the owner read their rows, and only theirs", async () => {
    expect(await as(a, model).count({})).toBe(aIds().length);
    const rows = (await as(a, model).findMany({})) as { userId: string }[];
    expect(rows.every((row) => row.userId === a.userId)).toBe(true);
  });

  it("shows another user nothing of A's", async () => {
    const other = as(b, model);
    expect(await other.findMany({ where: { id: { in: aIds() } } })).toEqual([]);
    expect(await other.count({ where: { id: { in: aIds() } } })).toBe(0);
    for (const id of aIds()) {
      expect(await other.findUnique({ where: { id } })).toBeNull();
      expect(await other.findFirst({ where: { id } })).toBeNull();
      await expect(other.findUniqueOrThrow({ where: { id } })).rejects.toThrow();
    }
  });

  it("lets another user update and delete none of A's rows", async () => {
    const other = as(b, model);
    expect(await other.updateMany({ where: { id: { in: aIds() } }, data: {} })).toEqual({ count: 0 });
    expect(await other.deleteMany({ where: { id: { in: aIds() } } })).toEqual({ count: 0 });
    for (const id of aIds()) {
      await expect(other.update({ where: { id }, data: {} })).rejects.toThrow();
      await expect(other.delete({ where: { id } })).rejects.toThrow();
    }
    expect(await raw(model).count({ where: { id: { in: aIds() } } })).toBe(aIds().length);
  });

  const entry = OWNED_MODELS.find((owned) => owned.model === model)!;
  for (const parent of entry.parents) {
    it(`refuses a row that points to A's ${parent.model}`, async () => {
      const aParent = a.ids[parent.model][0];
      await expect(as(b, model).create({ data: CHILD_DATA[model](aParent) })).rejects.toThrow(/owner mismatch/);
      const own = b.ids[model][0];
      await expect(
        as(b, model).update({ where: { id: own }, data: { [parent.field]: aParent } }),
      ).rejects.toThrow(/owner mismatch/);
      expect(await raw(model).count({ where: { [parent.field]: aParent, userId: b.userId } })).toBe(0);
    });
  }
});

describe("the scoped client", () => {
  it("refuses to move a row to another owner", async () => {
    const own = b.ids.Application[0];
    await expect(
      as(b, "Application").update({ where: { id: own }, data: { userId: a.userId } }),
    ).rejects.toThrow(OwnershipError);
    await expect(
      as(b, "Note").updateMany({ where: {}, data: { user: { connect: { id: a.userId } } } }),
    ).rejects.toThrow(OwnershipError);
  });

  it("refuses to pull A's child into B's parent with a nested connect", async () => {
    await expect(
      as(b, "Application").update({
        where: { id: b.ids.Application[0] },
        data: { notes: { connect: { id: a.ids.Note[0] } } },
      }),
    ).rejects.toThrow(/owner mismatch/);
  });

  it("refuses raw SQL", async () => {
    const scoped = scopeClient(db, b.userId);
    await expect(scoped.$queryRaw`SELECT 1`).rejects.toThrow(OwnershipError);
    await expect(scoped.$executeRawUnsafe(`DELETE FROM "Note"`)).rejects.toThrow(OwnershipError);
    expect(await db.note.count()).toBe(2);
  });

  it("keeps the owner filter inside transactions", async () => {
    const scoped = scopeClient(db, b.userId);
    const seen = await scoped.$transaction(async (tx) => tx.application.findMany({}));
    expect(seen.map(({ id }) => id)).toEqual(b.ids.Application);
  });

  it("hides rows that have no owner yet", async () => {
    await db.application.create({ data: { company: "Unclaimed" } });
    expect(await as(a, "Application").count({ where: { company: "Unclaimed" } })).toBe(0);
  });
});

describe("relations reached from a model that isn't owned", () => {
  // A shared, built-in-style theme that both users' documents use.
  const shareTheme = async () => {
    const theme = await db.theme.create({
      data: { builtIn: true, name: "Shared", headFont: "LORA", bodyFont: "LORA", accent: "#000000" },
    });
    await db.document.updateMany({ data: { themeId: theme.id } });
    return theme.id;
  };

  it("includes, selects and counts only the caller's rows", async () => {
    const themeId = await shareTheme();
    const scoped = scopeClient(db, b.userId);
    const [theme] = await scoped.theme.findMany({ where: { id: themeId }, include: { documents: true } });
    expect(theme.documents.map(({ id }) => id)).toEqual(b.ids.Document);
    const picked = await scoped.theme.findUniqueOrThrow({
      where: { id: themeId },
      select: { documents: { select: { id: true, versions: true } }, _count: true },
    });
    expect(picked.documents.map(({ id }) => id)).toEqual(b.ids.Document);
    expect(picked.documents.flatMap(({ versions }) => versions.map(({ id }) => id))).toEqual(b.ids.DocumentVersion);
    expect(picked._count).toEqual({ documents: b.ids.Document.length });
    expect(await db.document.count({ where: { themeId } })).toBe(a.ids.Document.length + b.ids.Document.length);
  });

  it("shows B none of A's rows through the User model or a round trip", async () => {
    const scoped = scopeClient(db, b.userId);
    const users = await scoped.user.findMany({ include: { applications: true, notes: true, _count: true } });
    const userA = users.find(({ id }) => id === a.userId)!;
    expect(userA.applications).toEqual([]);
    expect(userA.notes).toEqual([]);
    expect(Object.values(userA._count).every((count) => count === 0)).toBe(true);
    await shareTheme();
    const docs = await scoped.document.findMany({ include: { theme: { include: { documents: true } } } });
    const reached = docs.flatMap(({ theme }) => theme?.documents.map(({ id }) => id) ?? []);
    expect(reached.every((id) => b.ids.Document.includes(id))).toBe(true);
  });

  it("refuses filters, sorts and writes that reach A's rows", async () => {
    const themeId = await shareTheme();
    const scoped = scopeClient(db, b.userId);
    await expect(scoped.theme.findMany({ where: { documents: { some: { kind: "RESUME" } } } })).rejects.toThrow(
      OwnershipError,
    );
    await expect(scoped.theme.findMany({ orderBy: { documents: { _count: "desc" } } })).rejects.toThrow(OwnershipError);
    await expect(
      scoped.theme.update({ where: { id: themeId }, data: { documents: { deleteMany: {} } } }),
    ).rejects.toThrow(OwnershipError);
    await expect(
      scoped.document.update({
        where: { id: b.ids.Document[0] },
        // Prisma's types forbid this shape; the guard must still refuse it from untyped callers.
        data: { theme: { update: { documents: { set: [] } } } } as never,
      }),
    ).rejects.toThrow(OwnershipError);
    expect(await db.document.count({ where: { themeId } })).toBe(a.ids.Document.length + b.ids.Document.length);
  });
});

describe("the matrix", () => {
  it("covers every table that has an owner", async () => {
    const tables = await db.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'userId'`;
    const owned = tables.map(({ table_name }) => table_name).filter((name) => !["Session", "Account"].includes(name));
    expect(owned.sort()).toEqual(OWNED_MODELS.map(({ model }) => model).sort());
  });
});
