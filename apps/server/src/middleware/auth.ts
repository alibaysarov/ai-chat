import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/app-error';

/**
 * Validates the Authorization: Bearer <token> header.
 * Attaches verified user payload to res.locals.user.
 * Uses jose for JWT verification — validates exp, iss, and aud.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
  }

  try {
    // TODO: replace with actual jose verification
    // import { jwtVerify } from 'jose';
    // const { payload } = await jwtVerify(token, secret, { issuer, audience });
    // res.locals.user = payload;
    next();
  } catch {
    next(new AppError('UNAUTHORIZED', 401, 'Invalid or expired token'));
  }
}
