import { createBootstrap } from './container';

// `app` is an Elysia instance; `stop` releases what the container owns (plugins, database).
const { app, stop, port, logger } = await createBootstrap();

app.listen({ port, maxRequestBodySize: 10 * 1024 * 1024 });
logger.info(`API listening on ${app.server?.url}`);

const shutdown = async () => {
  await app.stop();
  await stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
