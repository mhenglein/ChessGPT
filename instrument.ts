/**
 * Sentry Instrumentation
 * Must be imported before all other modules
 */

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  sendDefaultPii: true,
  // Only enable in production/staging
  enabled: process.env.NODE_ENV !== "test",
});
