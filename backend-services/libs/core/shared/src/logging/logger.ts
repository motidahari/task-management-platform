export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogContext {
  readonly [key: string]: unknown;
}

/** Where a formatted log line goes. Swapped in tests to capture output. */
export type LogSink = (level: LogLevel, line: string) => void;

export interface ErrorDescription {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

/** Failures go to stderr so a log collector can split them without parsing. */
export const processStreamSink: LogSink = (level: LogLevel, line: string) => {
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

  stream.write(`${line}\n`);
};

/**
 * One structured JSON line per event, so logs stay machine-queryable by
 * `requestId`, `scope` or `errorCode` without a parsing convention.
 *
 * A `context.error` value is expanded into name/message/stack — `Error` has no
 * enumerable properties and would otherwise serialize as `{}`.
 */
export class Logger {
  constructor(
    private readonly scope: string,
    private readonly sink: LogSink = processStreamSink,
  ) {}

  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    const record = {
      level,
      time: new Date().toISOString(),
      scope: this.scope,
      message,
      ...context,
      ...('error' in (context ?? {}) ? { error: describeError(context?.error) } : {}),
    };

    this.sink(level, serialize(record, level, this.scope, message));
  }
}

export function describeError(error: unknown): ErrorDescription {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }

  return { name: typeof error, message: String(error) };
}

function serialize(record: object, level: LogLevel, scope: string, message: string): string {
  try {
    return JSON.stringify(record);
  } catch {
    // A context value was circular or otherwise unserializable. Losing the
    // context is acceptable; losing the event is not.
    return JSON.stringify({
      level,
      time: new Date().toISOString(),
      scope,
      message,
      contextSerializationFailed: true,
    });
  }
}
