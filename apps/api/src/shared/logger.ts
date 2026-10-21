export interface Logger {
  info(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  error(message: string, ...details: unknown[]): void;
}

export const consoleLogger = (scope = 'cms'): Logger => {
  const tag = `[${scope}]`;
  return {
    info: (message, ...details) => console.info(tag, message, ...details),
    warn: (message, ...details) => console.warn(tag, message, ...details),
    error: (message, ...details) => console.error(tag, message, ...details),
  };
};
