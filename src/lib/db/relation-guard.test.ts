import { describe, expect, it } from "vitest";

import { OwnershipError } from "./errors";
import { guardRelations } from "./relation-guard";

const B = "user-b";

describe("guardRelations: reads", () => {
  it("filters an owned list relation included from a model that isn't owned", () => {
    expect(guardRelations("Theme", "findMany", { include: { documents: true } }, B)).toEqual({
      include: { documents: { where: { userId: B } } },
    });
    expect(
      guardRelations("Theme", "findMany", { select: { name: true, documents: { where: { kind: "RESUME" } } } }, B),
    ).toEqual({ select: { name: true, documents: { where: { kind: "RESUME", userId: B } } } });
  });

  it("overrides an owner the caller put in the nested filter", () => {
    expect(guardRelations("User", "findMany", { include: { notes: { where: { userId: "user-a" } } } }, B)).toEqual({
      include: { notes: { where: { userId: B } } },
    });
  });

  it("filters at any depth, through owned and unowned hops", () => {
    const args = { include: { application: { include: { user: { include: { applications: true } } } } } };
    expect(guardRelations("Document", "findMany", args, B)).toEqual({
      include: { application: { include: { user: { include: { applications: { where: { userId: B } } } } } } },
    });
    expect(guardRelations("Application", "findMany", { include: { documents: { include: { theme: { include: { documents: true } } } } } }, B)).toEqual({
      include: {
        documents: { where: { userId: B }, include: { theme: { include: { documents: { where: { userId: B } } } } } },
      },
    });
  });

  it("counts only the caller's rows", () => {
    expect(guardRelations("Theme", "findMany", { include: { _count: true } }, B)).toEqual({
      include: { _count: { select: { documents: { where: { userId: B } } } } },
    });
    expect(
      guardRelations("Theme", "findMany", { select: { _count: { select: { documents: { where: { kind: "RESUME" } } } } } }, B),
    ).toEqual({ select: { _count: { select: { documents: { where: { kind: "RESUME", userId: B } } } } } });
  });

  it("leaves relations into models that aren't owned, and scalars, alone", () => {
    const args = { where: { name: "x" }, include: { sessions: true }, orderBy: { name: "asc" } };
    expect(guardRelations("User", "findMany", args, B)).toEqual(args);
    expect(guardRelations("Document", "findFirst", { include: { theme: true } }, B)).toEqual({ include: { theme: true } });
  });

  it("refuses a to-one owned relation from a model that isn't owned", () => {
    expect(() => guardRelations("Posting", "findMany", { include: { application: true } }, B)).toThrow(OwnershipError);
    expect(() => guardRelations("Fact", "findMany", { select: { application: { select: { id: true } } } }, B)).toThrow(
      OwnershipError,
    );
  });

  it("allows a to-one owned relation from an owned model (the triggers keep one owner)", () => {
    expect(guardRelations("Note", "findMany", { include: { application: true } }, B)).toEqual({
      include: { application: true },
    });
  });

  it("refuses filters and sorts that reach owned rows from a model that isn't owned", () => {
    for (const where of [
      { documents: { some: { kind: "RESUME" } } },
      { OR: [{ name: "x" }, { documents: { none: {} } }] },
      { NOT: { documents: { every: { kind: "RESUME" } } } },
      { application: { is: { company: "Figma" } } },
    ]) {
      const model = "application" in where ? "Posting" : "Theme";
      expect(() => guardRelations(model, "findMany", { where }, B)).toThrow(OwnershipError);
    }
    expect(() => guardRelations("Note", "findMany", { where: { user: { applications: { some: {} } } } }, B)).toThrow(
      OwnershipError,
    );
    expect(() => guardRelations("Theme", "findMany", { orderBy: { documents: { _count: "desc" } } }, B)).toThrow(
      OwnershipError,
    );
    expect(() => guardRelations("Theme", "findMany", { include: { documents: { where: { application: { company: "x" } } } } }, B)).not.toThrow();
  });

  it("allows filters into owned children from an owned model", () => {
    const args = { where: { documents: { some: { kind: "RESUME" } } } };
    expect(guardRelations("Application", "findMany", args, B)).toEqual(args);
  });
});

describe("guardRelations: writes", () => {
  it("refuses a nested write into owned rows from a model that isn't owned", () => {
    for (const data of [
      { documents: { deleteMany: {} } },
      { documents: { connect: { id: "doc-a" } } },
      { documents: { updateMany: { where: {}, data: { kind: "RESUME" } } } },
    ]) {
      expect(() => guardRelations("Theme", "update", { where: { id: "t" }, data }, B)).toThrow(OwnershipError);
    }
    expect(() => guardRelations("User", "update", { where: { id: B }, data: { applications: { create: { company: "x" } } } }, B)).toThrow(OwnershipError);
    expect(() => guardRelations("Theme", "upsert", { where: { id: "t" }, create: { name: "t" }, update: { documents: { set: [] } } }, B)).toThrow(OwnershipError);
  });

  it("refuses an owned write reached through a model that isn't owned", () => {
    const data = { theme: { update: { documents: { deleteMany: {} } } } };
    expect(() => guardRelations("Document", "update", { where: { id: "d" }, data }, B)).toThrow(OwnershipError);
    const nested = { theme: { update: { where: { id: "t" }, data: { documents: { disconnect: { id: "x" } } } } } };
    expect(() => guardRelations("Document", "update", { where: { id: "d" }, data: nested }, B)).toThrow(OwnershipError);
    const created = { theme: { connectOrCreate: { where: { id: "t" }, create: { name: "t", documents: { connect: { id: "x" } } } } } };
    expect(() => guardRelations("Document", "create", { data: created }, B)).toThrow(OwnershipError);
  });

  it("leaves owned children's writes and unowned writes to scopeArgs and the triggers", () => {
    const args = { data: { company: "x", notes: { create: { body: "n" } } } };
    expect(guardRelations("Application", "create", args, B)).toEqual(args);
    const theme = { where: { id: "d" }, data: { theme: { connect: { id: "t" } } } };
    expect(guardRelations("Document", "update", theme, B)).toEqual(theme);
  });
});
