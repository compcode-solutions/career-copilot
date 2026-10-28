import type { PrismaClient } from "@/generated/prisma/client";
import { ownedModel, OWNED_MODELS, type OwnedModel } from "@/lib/db/owned-models";

/**
 * The owner-scoped database client (ADR 0002 §3). `scopeClient(prisma, userId)`
 * returns the same Prisma client with a query extension that, for every owned
 * model (owned-models.ts):
 *
 * - adds `userId` to `where` on every read, update, delete, count and upsert,
 *   so another user's row looks exactly like a missing one;
 * - sets `userId` on every create, including nested creates of owned children;
 * - refuses to change a row's owner;
 * - refuses raw SQL, which a model filter cannot see.
 *
 * Attaching a row to another user's parent (an application, a document) is
 * refused by the database itself: Migration A adds an owner-check trigger on
 * every owned child table, so it holds inside transactions and nested writes
 * too. The cross-tenant test matrix (src/test/tenancy) is what proves all of
 * this, not the extension's own say-so.
 *
 * Reference: https://www.prisma.io/docs/orm/prisma-client/client-extensions/query
 */

/** Thrown when a query would cross tenants or escape the owner filter. */
export class OwnershipError extends Error {
  override name = "OwnershipError";
}

const WHERE_OPERATIONS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "upsert",
  "delete", "deleteMany",
]);

type Data = Record<string, unknown>;

const isObject = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const each = <T>(value: T | T[], fn: (item: T) => T): T | T[] =>
  Array.isArray(value) ? value.map(fn) : fn(value);

function refuseOwnerChange(data: Data) {
  if ("userId" in data || "user" in data) {
    throw new OwnershipError("A row's owner can't be changed.");
  }
}

/** Sets the owner on one create payload, the way the payload's mode allows. */
function ownCreate(entry: OwnedModel, data: Data, userId: string): Data {
  refuseOwnerChange(data);
  // A payload that uses relation fields is "checked" and can't take a scalar
  // foreign key, so the owner goes in as a relation there.
  const checked = entry.references.some((relation) => relation in data);
  const owned: Data = checked ? { ...data, user: { connect: { id: userId } } } : { ...data, userId };
  return ownChildren(entry, owned, userId);
}

function ownUpdate(entry: OwnedModel, data: Data, userId: string): Data {
  refuseOwnerChange(data);
  return ownChildren(entry, data, userId);
}

/** Owns the nested writes of owned children: `{ events: { create: [...] } }`. */
function ownChildren(entry: OwnedModel, data: Data, userId: string): Data {
  const result = { ...data };
  for (const [field, childModel] of Object.entries(entry.children)) {
    const nested = result[field];
    if (!isObject(nested)) continue;
    const child = ownedModel(childModel)!;
    const out: Data = { ...nested };
    if (nested.create !== undefined) {
      out.create = each(nested.create as Data | Data[], (item) => ownCreate(child, item, userId));
    }
    if (isObject(nested.createMany)) {
      const many = nested.createMany as { data: Data | Data[] };
      out.createMany = { ...many, data: each(many.data, (item) => ({ ...refuseAndReturn(item), userId })) };
    }
    if (nested.connectOrCreate !== undefined) {
      out.connectOrCreate = each(nested.connectOrCreate as Data | Data[], (item) => ({
        ...item,
        create: ownCreate(child, item.create as Data, userId),
      }));
    }
    if (nested.upsert !== undefined) {
      out.upsert = each(nested.upsert as Data | Data[], (item) => ({
        ...item,
        create: ownCreate(child, item.create as Data, userId),
        update: ownUpdate(child, item.update as Data, userId),
      }));
    }
    for (const key of ["update", "updateMany"] as const) {
      if (nested[key] === undefined) continue;
      out[key] = each(nested[key] as Data | Data[], (item) => ({
        ...item,
        data: ownUpdate(child, item.data as Data, userId),
      }));
    }
    result[field] = out;
  }
  return result;
}

function refuseAndReturn(data: Data): Data {
  refuseOwnerChange(data);
  return data;
}

/** Rewrites one operation's arguments so it only sees and writes `userId`'s rows. */
export function scopeArgs(entry: OwnedModel, operation: string, args: Data, userId: string): Data {
  const scoped: Data = { ...args };
  if (WHERE_OPERATIONS.has(operation)) {
    scoped.where = { ...(isObject(args.where) ? args.where : {}), userId };
  }
  switch (operation) {
    case "create":
      scoped.data = ownCreate(entry, args.data as Data, userId);
      break;
    case "createMany":
    case "createManyAndReturn":
      scoped.data = each(args.data as Data | Data[], (item) => ({ ...refuseAndReturn(item), userId }));
      break;
    case "update":
    case "updateMany":
    case "updateManyAndReturn":
      scoped.data = ownUpdate(entry, args.data as Data, userId);
      break;
    case "upsert":
      scoped.create = ownCreate(entry, args.create as Data, userId);
      scoped.update = ownUpdate(entry, args.update as Data, userId);
      break;
  }
  return scoped;
}

/** `client`, limited to the rows of `userId`. Never pass a userId that didn't come from the server session. */
export function scopeClient(client: PrismaClient, userId: string) {
  if (!userId) throw new OwnershipError("A scoped client needs a user.");
  return client.$extends({
    name: "owner-scope",
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (model === undefined) {
          throw new OwnershipError(`${operation} is not available on a user's client: raw SQL can't be scoped.`);
        }
        const entry = ownedModel(model);
        if (!entry) return query(args);
        return query(scopeArgs(entry, operation, (args ?? {}) as Data, userId) as typeof args);
      },
    },
  });
}

export type ScopedClient = ReturnType<typeof scopeClient>;

/** The owned models, parents before children: the order to claim or copy rows in. */
export function ownedModelsParentsFirst(): OwnedModel[] {
  const done = new Set<string>();
  const ordered: OwnedModel[] = [];
  const visit = (entry: OwnedModel) => {
    if (done.has(entry.model)) return;
    for (const parent of entry.parents) visit(ownedModel(parent.model)!);
    done.add(entry.model);
    ordered.push(entry);
  };
  OWNED_MODELS.forEach(visit);
  return ordered;
}
