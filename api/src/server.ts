import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { createApp } from './app.js';
import { EnvValidationError, parseEnv, type AppConfig } from './config/env.js';
import { createGroqClient } from './lib/groq.js';
import { createLogger, type Logger } from './lib/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function readVersion(): Promise<string> {
  // package.json sits one level above both src/ (tsx) and dist/ (node).
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && typeof parsed.version === 'string') {
    return parsed.version;
  }
  return '0.0.0';
}

function registerShutdown(server: Server, logger: Logger): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    // Force exit if open connections do not drain in time.
    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    // TODO(Phase 2+): close BullMQ workers/queues and Redis connections here.
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'error while closing HTTP server');
        process.exit(1);
      }
      logger.info('shutdown complete');
      process.exit(0);
    });
    server.closeIdleConnections();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

/** LAN URLs a phone on the same Wi-Fi can use (development hint only). */
function lanUrls(port: number): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => `http://${address.address}:${port}`);
}

function logListening(logger: Logger, config: AppConfig, version: string): void {
  logger.info({ host: config.host, port: config.port, env: config.nodeEnv, version }, 'api listening');
  const exposedToLan = config.host === '0.0.0.0' || config.host === '::';
  if (!config.isProduction && exposedToLan) {
    logger.info({ urls: lanUrls(config.port) }, 'reachable from devices on this network');
  }
}

async function main(): Promise<void> {
  let config;
  try {
    // The only place process.env is read.
    config = parseEnv(process.env);
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger({ level: config.logLevel });
  const version = await readVersion();

  const { apiKey } = config.groq;
  if (!apiKey) {
    logger.warn('GROQ_API_KEY is not set; POST /voice will answer 503 ai_not_configured');
  }
  const modelClient = apiKey ? createGroqClient(apiKey) : undefined;
  logger.info(
    { model: config.groq.model, reasoningEffort: config.groq.reasoningEffort, configured: Boolean(modelClient) },
    'ai provider: groq',
  );

  const app = createApp({ config, logger, version, ...(modelClient ? { modelClient } : {}) });

  const server = app.listen(config.port, config.host, (err?: Error) => {
    if (err) {
      logger.fatal({ err }, 'failed to start server');
      process.exit(1);
    }
    logListening(logger, config, version);
  });

  registerShutdown(server, logger);

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });
}

await main();
