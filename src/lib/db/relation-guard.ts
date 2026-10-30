import { OwnershipError } from "@/lib/db/errors";
import { ownedModel } from "@/lib/db/owned-models";
import { RELATIONS } from "@/lib/db/relations";

/**
 * Relation reads and writes on the owner-scoped client (ADR 0002 §3; the
 * slice 1 review's "must land before slice 3" item). `scopeArgs` filters the
 * model a query starts from; this module covers the rows a query reaches
 * through relations, from any model, owned or not:
 *
 * - `include` / `select` of a list relation into an owned model gets
 *   `where: { userId }`, at any depth, so `theme.findMany({ include:
 *   { documents: true } })` returns only the caller's documents;
 * - `_count` of such a relation counts only the caller's rows;
 * - a to-one relation into an owned model is followed only from an owned
 *   model (the owner-check triggers keep both ends on one owner); from a model
 *   that is not owned it is refused, because Prisma can't filter a to-one
 *   include;
 * - `where` and `orderBy` may not reach owned rows from a model that is not
 *   owned (filtering or sorting by them would tell B about A's rows);
 * - a nested write from a model that is not owned into an owned one is
 *   refused (`theme.update({ data: { documents: { deleteMany: {} } } })`).
 *
 * Writes from an owned model into its owned children stay with `scopeArgs`
 * and the triggers. Reference for filtered relation includes and counts:
 * https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries#filter-a-list-of-relations
 * https://www.prisma.io/docs/orm/prisma-client/queries/aggregation-grouping-summarizing#filter-the-relation-count
 */

type Data = Record<string, unknown>;

const isObject = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isOwned = (model: string) => ownedModel(model) !== undefined;

const relationOf = (model: string, field: string) => RELATIONS[model]?.[field];

function refuse(model: string, field: string, what: string): never {
  throw new OwnershipError(
    `${model}.${field} reaches rows that belong to one user; ${what} isn't allowed from ${model} on a user's client.`,
  );
}

const LIST_FILTERS = ["some", "every", "none"] as const;
const ONE_FILTERS = ["is", "isNot"] as const;

/** Refuses `where` filters that reach owned rows from a model that isn't owned. */
export function checkWhere(model: string, where: unknown): void {
  if (where === undefined || where === null) return;
  if (Array.isArray(where)) return where.forEach((item) => checkWhere(model, item));
  if (!isObject(where)) return;
  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" || key === "OR" || key === "NOT") {
      checkWhere(model, value);
      continue;
    }
    const relation = relationOf(model, key);
    if (!relation || value === undefined) continue;
    if (isOwned(relation.model) && !isOwned(model)) refuse(model, key, "filtering by it");
    if (!isObject(value)) continue;
    const keys = relation.list ? LIST_FILTERS : ONE_FILTERS;
    const nested = keys.filter((name) => name in value);
    if (nested.length > 0) nested.forEach((name) => checkWhere(relation.model, value[name]));
    else if (!relation.list) checkWhere(relation.model, value);
  }
}

/** Refuses `orderBy` that sorts by owned rows from a model that isn't owned. */
export function checkOrderBy(model: string, orderBy: unknown): void {
  if (Array.isArray(orderBy)) return orderBy.forEach((item) => checkOrderBy(model, item));
  if (!isObject(orderBy)) return;
  for (const [key, value] of Object.entries(orderBy)) {
    const relation = relationOf(model, key);
    if (!relation) continue;
    if (isOwned(relation.model) && !isOwned(model)) refuse(model, key, "sorting by it");
    if (!relation.list) checkOrderBy(relation.model, value);
  }
}

/** The arguments of a followed relation (or of a whole query): its own include/select/where/orderBy. */
function scopeNested(model: string, args: Data, userId: string): Data {
  const out: Data = { ...args };
  for (const key of ["include", "select"] as const) {
    if (isObject(args[key])) out[key] = scopeSelection(model, args[key] as Data, userId);
  }
  checkWhere(model, args.where);
  checkOrderBy(model, args.orderBy);
  return out;
}

const withOwner = (where: unknown, userId: string): Data => ({ ...(isObject(where) ? where : {}), userId });

function scopeCount(model: string, value: unknown, userId: string): unknown {
  const lists = Object.entries(RELATIONS[model] ?? {}).filter(([, relation]) => relation.list);
  const asked: Data =
    isObject(value) && isObject(value.select)
      ? (value.select as Data)
      : value
        ? Object.fromEntries(lists.map(([field]) => [field, true]))
        : {};
  const select: Data = {};
  for (const [field, option] of Object.entries(asked)) {
    const relation = relationOf(model, field);
    if (!relation || !option || !isOwned(relation.model)) {
      select[field] = option;
      continue;
    }
    const where = isObject(option) ? option.where : undefined;
    checkWhere(relation.model, where);
    select[field] = { where: withOwner(where, userId) };
  }
  return { select };
}

/** Scopes one `include` or `select` object of `model`. */
export function scopeSelection(model: string, selection: Data, userId: string): Data {
  const out: Data = {};
  for (const [field, value] of Object.entries(selection)) {
    if (field === "_count") {
      out[field] = scopeCount(model, value, userId);
      continue;
    }
    const relation = relationOf(model, field);
    if (!relation || !value) {
      out[field] = value;
      continue;
    }
    const args: Data = isObject(value) ? value : {};
    if (!isOwned(relation.model)) {
      out[field] = isObject(value) ? scopeNested(relation.model, args, userId) : value;
    } else if (relation.list) {
      out[field] = { ...scopeNested(relation.model, args, userId), where: withOwner(args.where, userId) };
    } else if (isOwned(model)) {
      out[field] = isObject(value) ? scopeNested(relation.model, args, userId) : value;
    } else {
      refuse(model, field, "including it");
    }
  }
  return out;
}

const items = (value: unknown): Data[] =>
  (Array.isArray(value) ? value : [value]).filter(isObject);

/** Refuses nested writes into owned rows from a model that isn't owned, at any depth. */
export function checkData(model: string, data: unknown): void {
  for (const row of items(data)) {
    for (const [field, value] of Object.entries(row)) {
      const relation = relationOf(model, field);
      if (!relation || !isObject(value)) continue;
      const target = relation.model;
      if (isOwned(target)) {
        if (!isOwned(model)) refuse(model, field, "writing through it");
        continue; // owned → owned: scopeArgs owns children, triggers check parents
      }
      for (const [operation, payload] of Object.entries(value)) {
        for (const item of items(payload)) {
          switch (operation) {
            case "create":
              checkData(target, item);
              break;
            case "connectOrCreate":
              checkData(target, item.create);
              break;
            case "upsert":
              checkData(target, item.create);
              checkData(target, item.update);
              checkWhere(target, item.where);
              break;
            case "update":
              if (isObject(item.data)) {
                checkData(target, item.data);
                checkWhere(target, item.where);
              } else checkData(target, item);
              break;
            case "updateMany":
              checkWhere(target, item.where);
              break;
            case "deleteMany":
              checkWhere(target, item);
              break;
          }
        }
      }
    }
  }
}

/**
 * The relation-scoped arguments of one operation on `model`, owned or not.
 * Throws OwnershipError when the query would
 * reach another user's rows in a way that can't be filtered.
 */
export function guardRelations(model: string, operation: string, args: Data, userId: string): Data {
  const out = scopeNested(model, args, userId);
  if (operation === "upsert") {
    checkData(model, args.create);
    checkData(model, args.update);
  } else if ("data" in args) {
    checkData(model, args.data);
  }
  return out;
}
