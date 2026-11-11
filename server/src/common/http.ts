import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 does not catch errors thrown inside async handlers: an unhandled rejection would
// take the whole server down. This passes them to Express so the client gets a 500 instead.
export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
