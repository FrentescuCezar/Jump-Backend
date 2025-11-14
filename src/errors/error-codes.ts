import { HttpStatus } from "@nestjs/common"

/**
 * ────────────────────────────────────────────────────────────────
 *  SHARED ERROR VOCABULARY
 *  These symbols travel over the wire FE ⇄ BE.
 * ────────────────────────────────────────────────────────────────
 *
 *  A normal (non-2xx) HTTP response looks like ONE of these:
 *
 *  1. Resource-level (no field errors)
 *     HTTP/1.1 404
 *     {
 *       "code": "NOT_FOUND",
 *       "params": { "resource": "Vehicle" }
 *     }
 *
 *  2. Validation / duplicate (with several field issues)
 *     HTTP/1.1 422
 *     {
 *       "code": "VALIDATION",
 *       "fields": [
 *         { "field": "email",    "code": "DUPLICATE" },
 *         { "field": "username", "code": "PROFANITY",
 *           "params": { "badWord": "xxx" } }
 *       ]
 *     }
 *
 *  Front-end helpers (`formatApiError`, `toastApiError`) consume this shape.
 */

/*───────── 1️⃣ top-level codes → HTTP status ─────────*/
export const ErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  FORBIDDEN: "FORBIDDEN",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL: "INTERNAL",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

export const ErrorStatusMap: Record<ErrorCode, HttpStatus> = {
  BAD_REQUEST: HttpStatus.BAD_REQUEST, //400
  CONFLICT: HttpStatus.CONFLICT, // 409
  NOT_FOUND: HttpStatus.NOT_FOUND, // 404
  VALIDATION: HttpStatus.UNPROCESSABLE_ENTITY, // 422
  FORBIDDEN: HttpStatus.FORBIDDEN, // 403
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED, // 401
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR, // 500
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
}

/**
 * Auto-generated reverse table (HTTP → code)
 * used by GlobalExceptionFilter to translate raw NestJS exceptions.
 */
export const StatusToErrorCode = Object.fromEntries(
  Object.entries(ErrorStatusMap).map(([c, s]) => [s, c]),
) as Record<number, ErrorCode>

/*───────── 2️⃣ field-level problem codes ─────────*/
export const FieldErrorCodes = {
  DUPLICATE: "DUPLICATE", // unique constraint
  BUSINESS_LOGIC: "BUSINESS_LOGIC", // logical conflict
  INVALID: "INVALID", // bad format
  REQUIRED: "REQUIRED", // missing
  PROFANITY: "PROFANITY", // contains banned words
} as const

export type FieldErrorCode =
  (typeof FieldErrorCodes)[keyof typeof FieldErrorCodes]

/** One concrete problem concerning a single form field. */
export interface FieldError<P = Record<string, unknown>> {
  field: string
  code: FieldErrorCode
  params?: P
}

/*───────── 3️⃣ final envelope sent to client ─────────*/
export interface ApiErrorBody<
  P = Record<string, unknown>, // top-level placeholders
  F = FieldError[], // list of detailed problems
> {
  code: ErrorCode
  params?: P
  fields?: F
  /* the two below are added / stripped by GlobalExceptionFilter */
  debug?: string
  path?: string
}
