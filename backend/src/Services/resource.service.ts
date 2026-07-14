import type { HydratedDocument } from 'mongoose';

import CrudService from './crud.service.js';
import { ConflictError } from '../Utils/errors/AppError.js';
import type ResourceRepository from '../Repository/data/resource.repository.js';
import type { Cradle } from '../DI/index.js';
import type { IResource } from '../Models/index.js';

/**
 * Business logic for Resources.
 *
 * It `extends CrudService`, so `getById`, `list`, `update`, and `remove` are
 * inherited as-is — no code needed. We only OVERRIDE `create` because resources
 * have an extra rule (names must be unique). The override does its custom check
 * and then calls `super.create(...)` to reuse the base behaviour — exactly like
 * method overriding + `super` in Java.
 *
 * Its repository arrives via dependency injection: the DI container constructs this
 * service and passes in `resourceRepository`. The service never does `new
 * ResourceRepository()` itself — that keeps it decoupled and trivial to test
 * (a test resolves the service from a test container, or `new`s it with a mock).
 */
class ResourceService extends CrudService<IResource, ResourceRepository> {
  constructor({ resourceRepository }: Pick<Cradle, 'resourceRepository'>) {
    super(resourceRepository);
  }

  /** Overridden: enforce unique name before delegating to the base create. */
  override async create(payload: Partial<IResource>): Promise<HydratedDocument<IResource>> {
    if (payload.name) {
      const existing = await this.repository.findByName(payload.name);
      if (existing) {
        throw new ConflictError(`A resource named "${payload.name}" already exists`);
      }
    }
    return super.create(payload);
  }
}

export default ResourceService;
