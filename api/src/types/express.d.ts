import type { AuthContext } from '../lib/auth.js';

// Typed `res.locals` shared by our middleware. Express merges this interface
// into every Response, so handlers get type-checked access without casts.
declare global {
  namespace Express {
    interface Locals {
      /** Set by `requestId` middleware on every request. */
      requestId: string;
      /** Set by `requireAuth` only after the token verifier accepted the token. */
      auth?: AuthContext;
      /** Set by `validate()` with the parsed (not raw) request parts. */
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
