import type { PluginLogger } from '@cms/sdk/plugin';

export type Logger = PluginLogger;

export const consoleLogger = (scope = 'cms'): Logger => {
  const tag = `[${scope}]`;
  return {
    info: (message, ...details) => console.info(tag, message, ...details),
    warn: (message, ...details) => console.warn(tag, message, ...details),
    error: (message, ...details) => console.error(tag, message, ...details),
  };
};
