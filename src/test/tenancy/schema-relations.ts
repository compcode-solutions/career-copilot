import { readFileSync } from "node:fs";

/** One relation field: the model it points to, and whether it holds many rows. */
export type Relation = { model: string; list: boolean };

/**
 * The relation fields of every model in a Prisma schema, by model then field.
 * A field is a relation when its type is another model's name. Used by the
 * guard test that keeps `src/lib/db/relations.ts` in step with schema.prisma.
 */
export function parseRelations(schema: string): Record<string, Record<string, Relation>> {
  const blocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  const models = new Set(blocks.map(([, name]) => name));
  const result: Record<string, Record<string, Relation>> = {};
  for (const [, name, body] of blocks) {
    const fields: Record<string, Relation> = {};
    for (const line of body.split("\n")) {
      const match = line.replace(/\/\/.*$/, "").match(/^\s*(\w+)\s+(\w+)(\[\])?\??(\s|$)/);
      if (!match || !models.has(match[2])) continue;
      fields[match[1]] = { model: match[2], list: match[3] === "[]" };
    }
    if (Object.keys(fields).length > 0) result[name] = fields;
  }
  return result;
}

export const schemaRelations = () =>
  parseRelations(readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8"));
