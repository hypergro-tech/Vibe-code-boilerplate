import mongoose from 'mongoose';
import type { Connection } from 'mongoose';

import logger from './logger.js';
import AppConfig from './AppConfig.js';

/**
 * Establish the MongoDB connection. Throws on failure so the caller (bootstrap)
 * can decide how to react — we deliberately do NOT call process.exit() here to
 * keep this module side-effect-free and testable.
 */
export const connectToDB = async (): Promise<Connection> => {
  mongoose.connection.on('connected', () =>
    logger.success(`MongoDB connected (db: ${AppConfig.DB_NAME})`)
  );
  mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  // dbName gives each app its OWN database named after the app, so many apps can
  // share one cluster URI without colliding (and never fall back to "test").
  await mongoose.connect(AppConfig.MONGO_URI, { dbName: AppConfig.DB_NAME });
  return mongoose.connection;
};

/** Cleanly close the MongoDB connection (used during graceful shutdown). */
export const disconnectFromDB = async (): Promise<void> => {
  await mongoose.connection.close();
};

export default connectToDB;
