/**
 * The models that belong to one account (ADR 0002), and how they hang
 * together. The owner-scoped client (`scoped.ts`) and the cross-tenant test
 * matrix both read this list, so a model is protected and tested as soon as
 * it is added here. A database test fails if a table has a `userId` column
 * but is missing from this list.
 *
 * Phase 3 adds models aggregate by aggregate (docs/implementation/phase-3-plan.md).
 * Slice 1: the applications aggregate and background jobs.
 */

/** A foreign key to another owned model: the parent must belong to the same user. */
export type OwnedParent = {
  /** The scalar foreign-key field, e.g. "applicationId". */
  field: string;
  /** The relation field that sets it in a "checked" write, e.g. "application". */
  relation: string;
  /** The parent's model name. */
  model: string;
};

export type OwnedModel = {
  /** Model name as in schema.prisma, e.g. "StatusEvent". */
  model: string;
  /** Owned parents this model points to. */
  parents: readonly OwnedParent[];
  /** Relation fields that hold owned children (list relations), mapped to the child model. */
  children: Readonly<Record<string, string>>;
  /**
   * The to-one relations whose foreign key sits on this model, owned or not.
   * Any of these in `data` makes the write "checked", where the owner must be
   * set as a relation instead of a scalar `userId`.
   */
  references: readonly string[];
};

const application: OwnedParent = { field: "applicationId", relation: "application", model: "Application" };

export const OWNED_MODELS: readonly OwnedModel[] = [
  {
    model: "Application",
    parents: [],
    children: {
      events: "StatusEvent",
      documents: "Document",
      messages: "ChatMessage",
      notes: "Note",
      jobs: "Job",
    },
    references: ["user"],
  },
  { model: "StatusEvent", parents: [application], children: {}, references: ["user", "application"] },
  {
    model: "Document",
    parents: [application],
    children: { versions: "DocumentVersion" },
    references: ["user", "application", "theme"],
  },
  {
    model: "DocumentVersion",
    parents: [{ field: "documentId", relation: "document", model: "Document" }],
    children: {},
    references: ["user", "document"],
  },
  { model: "ChatMessage", parents: [application], children: {}, references: ["user", "application"] },
  { model: "Note", parents: [application], children: {}, references: ["user", "application"] },
  { model: "Job", parents: [application], children: {}, references: ["user", "application"] },
];

const byName = new Map(OWNED_MODELS.map((entry) => [entry.model, entry]));

/** The owned-model entry for a model name, or undefined when the model is not owned (yet). */
export function ownedModel(model: string | undefined): OwnedModel | undefined {
  return model === undefined ? undefined : byName.get(model);
}

/** The Prisma client property for a model: "StatusEvent" → "statusEvent". */
export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}
