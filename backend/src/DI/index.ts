import { createContainer, asClass, InjectionMode } from 'awilix';
import type { AwilixContainer } from 'awilix';

import ResourceRepository from '../Repository/data/resource.repository.js';
import ResourceService from '../Services/resource.service.js';
import ResourceController from '../Controllers/resource.controller.js';

/**
 * Dependency Injection — the application container (the DI wiring).
 *
 * WHAT THIS IS (in one sentence): instead of each file doing `new XService(new
 * XRepository())` by hand, every controller / service / repository is registered
 * here ONCE, and the container builds the whole object graph for you and injects
 * each piece where it's needed.
 *
 * WHY IT EXISTS:
 *   - One wiring place. To see how the app is assembled, read this file.
 *   - Testability. A class receives its dependencies, so a test can pass mocks.
 *   - No tangled `new` calls scattered across controllers and routes.
 *
 * HOW IT WORKS (Awilix, PROXY mode):
 *   Each class declares the dependencies it needs by DESTRUCTURING them from the
 *   container "cradle" in its constructor, typed against {@link Cradle}:
 *
 *       constructor({ resourceRepository }: Pick<Cradle, 'resourceRepository'>) { ... }
 *
 *   When the container builds that class, it looks up each destructured name
 *   (`resourceRepository`) among the registrations below and passes it in. Names
 *   are the contract — the key you register here MUST match the property name the
 *   constructor destructures. (PROXY mode reads the object you destructure, not
 *   raw parameter names, so this stays correct even after TypeScript compiles.)
 *
 * Everything is registered `.singleton()`: one shared instance per process, which
 * is correct because our layers are stateless (they hold no per-request data).
 */

/**
 * The container's "cradle": the typed registry of everything injectable.
 * Every key here is a dependency name. This interface is what gives you full
 * type-safety and autocomplete when you destructure the cradle in a constructor.
 */
export interface Cradle {
  // Repositories (data access — the only layer that talks to Mongoose)
  resourceRepository: ResourceRepository;
  // Services (business logic)
  resourceService: ResourceService;
  // Controllers (HTTP adapters)
  resourceController: ResourceController;
}

const container: AwilixContainer<Cradle> = createContainer<Cradle>({
  injectionMode: InjectionMode.PROXY,
});

/**
 * REGISTER YOUR RESOURCES HERE.
 *
 * When you add a new API resource (by copying the `resource.*` files), add its
 * repository, service, and controller to BOTH the {@link Cradle} interface above
 * and this register() block — that's the single place wiring lives. Follow the
 * `resource*` lines exactly.
 */
container.register({
  resourceRepository: asClass(ResourceRepository).singleton(),
  resourceService: asClass(ResourceService).singleton(),
  resourceController: asClass(ResourceController).singleton(),
});

export default container;
