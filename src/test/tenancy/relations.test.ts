import { describe, expect, it } from "vitest";

import { RELATIONS } from "@/lib/db/relations";

import { parseRelations, schemaRelations } from "./schema-relations";

describe("the relation map", () => {
  it("matches prisma/schema.prisma", () => {
    expect(RELATIONS).toEqual(schemaRelations());
  });

  it("reads list, optional and required relations and ignores scalars and comments", () => {
    const schema = `
model A {
  id    String @id
  bs    B[]
  // c  C
  name  String
}
model B {
  id  String @id
  a   A?     @relation(fields: [aId], references: [id])
  aId String?
}`;
    expect(parseRelations(schema)).toEqual({
      A: { bs: { model: "B", list: true } },
      B: { a: { model: "A", list: false } },
    });
  });
});
