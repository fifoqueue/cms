import { createBootstrap } from '#api/container';

// `app` is an Elysia instance; `stop` releases what the container owns (plugins, database).
const { app, stop, port, hostname, logger, maxRequestBodySize } =
  await createBootstrap();

app.listen({ port, hostname, maxRequestBodySize });
logger.info(`API listening on ${app.server?.url}`);

const shutdown = async () => {
  await app.stop();
  await stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
