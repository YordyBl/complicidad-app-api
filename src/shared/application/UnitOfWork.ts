/**
 * Unit of Work port — the domain/application boundary for transactional writes.
 *
 * All mutation use cases that need atomicity across multiple repositories
 * receive a `UnitOfWork` and run inside `uow.run(fn)`.
 *
 * The `run` method:
 * 1. Starts a database transaction
 * 2. Creates scoped repository instances bound to that transaction
 * 3. Passes them as `UnitOfWorkScope` to the callback
 * 4. Commits if the callback succeeds, rolls back if it throws
 * 5. Returns the callback's return value
 *
 * Repository ports are purpose-specific, not generic CRUD.
 * Each domain aggregate gets its own method on the scope.
 *
 * @example
 * ```ts
 * class RegisterPurchaseUseCase {
 *   async execute(command: RegisterPurchaseCommand, uow: UnitOfWork): Promise<Result<Purchase, Error>> {
 *     return uow.run(async (scope) => {
 *       const typedScope = scope as PurchaseScope;
 *       await typedScope.inventoryLots.save(lot);
 *       await typedScope.cashLedger.append(entry);
 *       return ok(purchase);
 *     });
 *   }
 * }
 * ```
 */

/**
 * Transaction-scoped repository access.
 *
 * This base interface is deliberately empty — modules define their own
 * extended scope interfaces with the specific repositories they need.
 * The TypeORM-backed implementation provides all repositories via a
 * concrete extended scope class.
 *
 * Phase 1: empty foundation only.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UnitOfWorkScope {
  // Repository ports are added per module.
  // See RegisterPurchaseUseCase for an example of a module-specific scope.
}

/**
 * Unit of Work port.
 */
export interface UnitOfWork {
  /**
   * Execute the given function inside a database transaction.
   *
   * @param fn - Callback receiving scoped repositories. Must be deterministic
   *             — side effects are rolled back if it throws.
   * @returns The callback's return value (wrapped in a Promise).
   */
  run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T>;
}
