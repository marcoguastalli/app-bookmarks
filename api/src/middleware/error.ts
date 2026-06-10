import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

export function errorResponse(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  return c.json({ error: { code, message, ...(details ? { details } : {}) } }, status as any);
}

export function notFound(c: Context, resource = "Resource") {
  return errorResponse(c, 404, "NOT_FOUND", `${resource} not found`);
}

export function conflict(c: Context, message: string) {
  return errorResponse(c, 409, "CONFLICT", message);
}

export function badRequest(c: Context, message: string, details?: unknown) {
  return errorResponse(c, 400, "BAD_REQUEST", message, details);
}

export function globalErrorHandler(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: "HTTP_ERROR", message: err.message } },
      err.status
    );
  }
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: err.flatten().fieldErrors,
        },
      },
      400
    );
  }
  console.error("[error]", err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
}
