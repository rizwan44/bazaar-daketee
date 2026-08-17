type LogMeta = Record<string, unknown>;

/**
 * Minimal structured logger: timestamp + event name + metadata, per line as JSON.
 * Swap for pino/winston later without touching call sites.
 */
function log(level: 'info' | 'warn' | 'error', event: string, meta: LogMeta = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, meta?: LogMeta) => log('info', event, meta),
  warn: (event: string, meta?: LogMeta) => log('warn', event, meta),
  error: (event: string, meta?: LogMeta) => log('error', event, meta),
};
