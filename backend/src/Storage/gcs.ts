import { Storage } from '@google-cloud/storage';
import type { Bucket } from '@google-cloud/storage';

import AppConfig from '../Config/AppConfig.js';
import AppError from '../Utils/errors/AppError.js';

/**
 * Google Cloud Storage helper.
 *
 * Apps in this platform are STATELESS — the container filesystem is wiped on
 * every deploy and many copies can run at once. So uploaded files must NEVER be
 * written to local disk (`fs.writeFile`, `multer.diskStorage`, an `uploads/`
 * folder…). They go here, to GCS, instead.
 *
 * On Cloud Run the client authenticates as the runtime service account (ADC) —
 * no key file is read from code. Locally, GOOGLE_APPLICATION_CREDENTIALS points
 * at a key. The bucket name comes from env via AppConfig (GCS_BUCKET).
 *
 * Typical use with an Express route (multer memoryStorage → Buffer):
 *
 *   import multer from 'multer';
 *   import { uploadObject } from '../Storage/index.js';
 *   const upload = multer({ storage: multer.memoryStorage() });
 *   router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
 *     const { url, key } = await uploadObject({
 *       buffer: req.file!.buffer,
 *       destination: `uploads/${Date.now()}-${req.file!.originalname}`,
 *       contentType: req.file!.mimetype,
 *     });
 *     sendSuccess(res, { data: { url, key } });
 *   }));
 */

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let cachedBucket: Bucket | null = null;

const getBucket = (): Bucket => {
  if (!AppConfig.GCS_BUCKET) {
    throw new AppError(
      'File storage is not configured. Set GCS_BUCKET (and deploy with a service account that can write to it).',
      500
    );
  }
  if (!cachedBucket) {
    const storage = new Storage(
      AppConfig.GCS_PROJECT_ID ? { projectId: AppConfig.GCS_PROJECT_ID } : {}
    );
    cachedBucket = storage.bucket(AppConfig.GCS_BUCKET);
  }
  return cachedBucket;
};

export interface UploadOptions {
  /** File contents in memory (e.g. multer memoryStorage `req.file.buffer`). */
  buffer: Buffer;
  /** Object key within the bucket, e.g. `uploads/2026/photo.png`. */
  destination: string;
  contentType?: string;
  /** true → object is world-readable and `url` is a public URL. */
  makePublic?: boolean;
  /** For private objects, how long the returned signed URL stays valid. */
  signedUrlTtlMs?: number;
}

export interface UploadResult {
  key: string;
  url: string;
}

/** Upload a buffer to GCS and return its key + a usable URL. */
export const uploadObject = async (opts: UploadOptions): Promise<UploadResult> => {
  const file = getBucket().file(opts.destination);
  await file.save(opts.buffer, { resumable: false, contentType: opts.contentType });

  if (opts.makePublic) {
    await file.makePublic();
    return { key: opts.destination, url: file.publicUrl() };
  }
  return { key: opts.destination, url: await getSignedReadUrl(opts.destination, opts.signedUrlTtlMs) };
};

/** Get a time-limited read URL for a private object. */
export const getSignedReadUrl = async (key: string, ttlMs = DEFAULT_TTL_MS): Promise<string> => {
  const [url] = await getBucket()
    .file(key)
    .getSignedUrl({ action: 'read', expires: Date.now() + ttlMs });
  return url;
};

/** Delete an object (no error if it's already gone). */
export const deleteObject = async (key: string): Promise<void> => {
  await getBucket().file(key).delete({ ignoreNotFound: true });
};
