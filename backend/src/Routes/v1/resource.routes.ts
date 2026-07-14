import express from 'express';

import container from '../../DI/index.js';
import { asyncHandler, validate } from '../../Middlewares/index.js';
import {
  createResourceSchema,
  updateResourceSchema,
  resourceIdSchema,
  listResourceSchema,
} from '../../Validators/resource.validator.js';

const router = express.Router();

// Pull the controller instance from the DI container (built once). Its handler
// methods are arrow functions, so `this` stays bound when passed as callbacks.
const resource = container.cradle.resourceController;

router
  .route('/')
  .get(validate(listResourceSchema), asyncHandler(resource.listResources))
  .post(validate(createResourceSchema), asyncHandler(resource.createResource));

router
  .route('/:id')
  .get(validate(resourceIdSchema), asyncHandler(resource.getResource))
  .patch(validate(updateResourceSchema), asyncHandler(resource.updateResource))
  .delete(validate(resourceIdSchema), asyncHandler(resource.deleteResource));

export default router;
