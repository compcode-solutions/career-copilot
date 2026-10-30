/** Thrown when a query would cross tenants or escape the owner filter. */
export class OwnershipError extends Error {
  override name = "OwnershipError";
}
