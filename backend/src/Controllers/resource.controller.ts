import { StatusCodes } from 'http-status-codes';
import type { Request, Response } from 'express';
import type { FilterQuery } from 'mongoose';

import { sendSuccess } from '../Utils/index.js';
import type ResourceService from '../Services/resource.service.js';
import type { Cradle } from '../DI/index.js';
import type { IResource } from '../Models/index.js';
import type {
  CreateResourceBody,
  ListResourceQuery,
  UpdateResourceBody,
} from '../Validators/resource.validator.js';

/**
 * Controllers are thin HTTP adapters: their only job is HTTP concerns — read the
 * (already validated) request, delegate to a service, and shape the response.
 * No business logic and no try/catch (asyncHandler forwards rejections to the
 * error middleware).
 *
 * The controller is a CLASS so it can receive its service through dependency
 * injection: the DI container (`src/DI/index.ts`) constructs it once and
 * passes in `resourceService`. The handler methods are ARROW FUNCTIONS — that
 * binds `this`, so they can be passed straight to the router as callbacks.
 *
 * `validate(...)` has already parsed and coerced the request, so the casts below
 * are the safe, documented boundary between untyped Express input and our types.
 */
class ResourceController {
  private readonly resourceService: ResourceService;

  constructor({ resourceService }: Pick<Cradle, 'resourceService'>) {
    this.resourceService = resourceService;
  }

  createResource = async (req: Request, res: Response): Promise<void> => {
    const resource = await this.resourceService.create(req.body as CreateResourceBody);
    sendSuccess(res, {
      statusCode: StatusCodes.CREATED,
      data: resource,
      message: 'Resource created',
    });
  };

  getResource = async (req: Request, res: Response): Promise<void> => {
    const resource = await this.resourceService.getById(req.params.id);
    sendSuccess(res, { data: resource });
  };

  listResources = async (req: Request, res: Response): Promise<void> => {
    const { page, limit, status } = req.query as unknown as ListResourceQuery;
    const filter: FilterQuery<IResource> = status ? { status } : {};
    const { items, meta } = await this.resourceService.list(filter, { page, limit });
    sendSuccess(res, { data: items, meta, message: 'Resources fetched' });
  };

  updateResource = async (req: Request, res: Response): Promise<void> => {
    const resource = await this.resourceService.update(req.params.id, req.body as UpdateResourceBody);
    sendSuccess(res, { data: resource, message: 'Resource updated' });
  };

  deleteResource = async (req: Request, res: Response): Promise<void> => {
    const result = await this.resourceService.remove(req.params.id);
    sendSuccess(res, { data: result, message: 'Resource deleted' });
  };
}

export default ResourceController;
