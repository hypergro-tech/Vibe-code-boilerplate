import { z } from 'zod';

import AppConfig from './AppConfig.js';
import {
  createResourceSchema,
  updateResourceSchema,
  listResourceSchema,
} from '../Validators/resource.validator.js';

/**
 * Self-documenting API.
 *
 * The OpenAPI document is generated DIRECTLY from the same Zod validators the
 * routes already use, so the docs can never drift from the real request
 * validation. Served by swagger-ui-express at /api/docs.
 *
 * There is NO extra codegen dependency here: we use Zod v4's native
 * `z.toJSONSchema`. Every schema conversion is defensive — a failure to convert
 * one schema degrades that endpoint's docs but never crashes the app.
 */

type JsonSchema = Record<string, unknown>;

/** Convert a Zod schema to an OpenAPI 3.0 schema object (never throws). */
const toSchema = (schema: z.ZodType): JsonSchema => {
  try {
    return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as JsonSchema;
  } catch {
    return { type: 'object' };
  }
};

/** Expand a Zod object (query) schema into individual OpenAPI query parameters. */
const queryParams = (schema: z.ZodType): JsonSchema[] => {
  const js = toSchema(schema);
  const props = (js.properties ?? {}) as Record<string, JsonSchema>;
  const required = (js.required ?? []) as string[];
  return Object.entries(props).map(([name, s]) => ({
    name,
    in: 'query',
    required: required.includes(name),
    schema: s,
  }));
};

const idParam: JsonSchema = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Mongo ObjectId',
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
};

/** The standard `{ success, message, data }` success envelope. */
const successEnvelope = (data: JsonSchema): JsonSchema => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' },
    data,
  },
});

/** The standard `{ success:false, message, details? }` error envelope. */
const errorEnvelope: JsonSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string' },
    details: { type: 'array', items: { type: 'object' } },
  },
};

interface CrudResourceDocs {
  /** Path relative to the /api server, e.g. '/v1/resources'. */
  path: string;
  /** Grouping tag, e.g. 'Resources'. */
  tag: string;
  createBody: z.ZodType;
  updateBody: z.ZodType;
  listQuery?: z.ZodType;
}

/** Build the five standard CRUD operations for one resource. */
const buildCrudPaths = (r: CrudResourceDocs): Record<string, JsonSchema> => {
  const jsonBody = (schema: z.ZodType): JsonSchema => ({
    required: true,
    content: { 'application/json': { schema: toSchema(schema) } },
  });
  const ok = (description: string): JsonSchema => ({
    description,
    content: { 'application/json': { schema: successEnvelope({ type: 'object' }) } },
  });
  const err = (description: string): JsonSchema => ({
    description,
    content: { 'application/json': { schema: errorEnvelope } },
  });

  return {
    [r.path]: {
      get: {
        tags: [r.tag],
        summary: `List ${r.tag}`,
        parameters: r.listQuery ? queryParams(r.listQuery) : [],
        responses: { '200': ok('A paginated list') },
      },
      post: {
        tags: [r.tag],
        summary: `Create a ${r.tag}`,
        requestBody: jsonBody(r.createBody),
        responses: { '201': ok('Created'), '422': err('Validation failed') },
      },
    },
    [`${r.path}/{id}`]: {
      get: {
        tags: [r.tag],
        summary: `Get one ${r.tag} by id`,
        parameters: [idParam],
        responses: { '200': ok('Found'), '404': err('Not found') },
      },
      patch: {
        tags: [r.tag],
        summary: `Update a ${r.tag}`,
        parameters: [idParam],
        requestBody: jsonBody(r.updateBody),
        responses: { '200': ok('Updated'), '404': err('Not found'), '422': err('Validation failed') },
      },
      delete: {
        tags: [r.tag],
        summary: `Delete a ${r.tag}`,
        parameters: [idParam],
        responses: { '200': ok('Deleted'), '404': err('Not found') },
      },
    },
  };
};

/**
 * REGISTER YOUR RESOURCES HERE.
 * When you add a new API resource (by copying the resource.* files), add one
 * entry below and it appears in /api/docs automatically — no other doc work.
 */
const resources: CrudResourceDocs[] = [
  {
    path: '/v1/resources',
    tag: 'Resources',
    createBody: createResourceSchema.body,
    updateBody: updateResourceSchema.body,
    listQuery: listResourceSchema.query,
  },
];

const buildOpenApiDocument = (): JsonSchema => {
  const paths: Record<string, JsonSchema> = {};
  for (const r of resources) Object.assign(paths, buildCrudPaths(r));

  return {
    openapi: '3.0.0',
    info: {
      title: `${AppConfig.APP_NAME} API`,
      version: '1.0.0',
      description:
        'Auto-generated from the Zod request validators. The browser reaches this API at same-origin /api/*.',
    },
    servers: [{ url: '/api', description: 'Same-origin API (proxied by the frontend)' }],
    paths,
    components: {},
  };
};

/** The OpenAPI 3.0 document served at /api/docs. */
export const openApiDocument: JsonSchema = buildOpenApiDocument();

export default openApiDocument;
