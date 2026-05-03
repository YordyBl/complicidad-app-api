/**
 * Request logging middleware.
 *
 * Logs incoming HTTP method, path, response status, and duration.
 * This is intentionally lightweight — no external logging library.
 * Structured output makes it easy to grep or forward.
 *
 * In production, consider swapping for pino/morgan with log levels.
 */
import type { Request, Response, NextFunction } from 'express';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();
  const method = req.method;
  const path = req.originalUrl;

  // Capture the response finish event to log status + duration
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;

    console.log(
      `[complicidad] ${method} ${path} → ${String(status)} (${String(duration)}ms)`,
    );
  });

  next();
}
