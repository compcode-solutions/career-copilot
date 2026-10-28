import { describe, expect, it } from "vitest";

import { ownedModel } from "./owned-models";
import { OwnershipError, ownedModelsParentsFirst, scopeArgs } from "./scoped";

const application = ownedModel("Application")!;
const document = ownedModel("Document")!;

describe("scopeArgs", () => {
  it("adds the owner to every filter, overriding one from input", () => {
    expect(scopeArgs(application, "findMany", { where: { userId: "a", company: "X" } }, "b")).toEqual({
      where: { userId: "b", company: "X" },
    });
    expect(scopeArgs(application, "count", {}, "b")).toEqual({ where: { userId: "b" } });
  });

  it("sets the owner as a scalar, or as a relation when the payload is checked", () => {
    expect(scopeArgs(document, "create", { data: { applicationId: "x", kind: "RESUME" } }, "b")).toEqual({
      data: { applicationId: "x", kind: "RESUME", userId: "b" },
    });
    expect(
      scopeArgs(document, "create", { data: { application: { connect: { id: "x" } }, kind: "RESUME" } }, "b"),
    ).toEqual({ data: { application: { connect: { id: "x" } }, kind: "RESUME", user: { connect: { id: "b" } } } });
  });

  it("owns nested creates, several levels deep", () => {
    const { data } = scopeArgs(
      application,
      "create",
      { data: { documents: { create: [{ kind: "RESUME", versions: { createMany: { data: [{ cause: "WRITTEN" }] } } }] } } },
      "b",
    ) as { data: { documents: { create: { userId: string; versions: { createMany: { data: { userId: string }[] } } }[] } } };
    expect(data.documents.create[0].userId).toBe("b");
    expect(data.documents.create[0].versions.createMany.data[0].userId).toBe("b");
  });

  it("refuses to set or change an owner from input", () => {
    expect(() => scopeArgs(application, "update", { where: { id: "x" }, data: { userId: "a" } }, "b")).toThrow(
      OwnershipError,
    );
    expect(() => scopeArgs(application, "createMany", { data: [{ user: { connect: { id: "a" } } }] }, "b")).toThrow(
      OwnershipError,
    );
  });

  it("orders parents before children", () => {
    const order = ownedModelsParentsFirst().map(({ model }) => model);
    expect(order.indexOf("Application")).toBeLessThan(order.indexOf("Document"));
    expect(order.indexOf("Document")).toBeLessThan(order.indexOf("DocumentVersion"));
  });
});
