type LogFields = Readonly<Record<string, boolean | number | string | null | undefined>>;

function write(level: "error" | "info" | "warn", event: string, fields: LogFields = {}): void {
  const payload = JSON.stringify({ at: new Date().toISOString(), level, event, ...fields });
  process.stderr.write(`${payload}\n`);
}

export function logError(event: string, fields: LogFields = {}): void {
  write("error", event, fields);
}

export function logInfo(event: string, fields: LogFields = {}): void {
  write("info", event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  write("warn", event, fields);
}
