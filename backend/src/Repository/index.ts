// The Repository layer holds ALL outward data access, split by kind:
//   data/     → our own database (Mongoose) repositories
//   external/ → third-party integrations (e.g. Google Cloud Storage) — see external/
// This barrel re-exports the database repositories. Third-party wrappers live
// under `Repository/external/` and are imported from there directly.
export { default as CrudRepository } from './data/crud.repository.js';
export type { PaginatedResult, PaginationMeta, PaginationOptions } from './data/crud.repository.js';
export { default as ResourceRepository } from './data/resource.repository.js';
