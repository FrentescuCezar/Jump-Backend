import { HttpException } from "@nestjs/common"

import {
  ApiErrorBody,
  ErrorCode,
  ErrorStatusMap,
  FieldError,
} from "./error-codes"

/**
 * Throw AppError from your services / controllers instead of
 * `new ForbiddenException()` or `new ConflictException()`.
 *
 * Examples
 * --------
 *  1) Simple 404 with a placeholder
 *  throw new AppError(ErrorCodes.NOT_FOUND,
 *    { params: { resource: 'User' } });
 *
 *
 *  2) Two field problems in one go
 *  throw new AppError(ErrorCodes.VALIDATION, {
 *    fields: [
 *      { field: 'email',    code: FieldErrorCodes.DUPLICATE },
 *      { field: 'username', code: FieldErrorCodes.PROFANITY }
 *    ]
 *  });
 */
export class AppError<
  P = Record<string, unknown>,
  F extends FieldError[] = FieldError[],
> extends HttpException {
  constructor(
    code: ErrorCode,
    opts?: { fields?: F; params?: P; debug?: string; status?: number },
  ) {
    const status = opts?.status ?? ErrorStatusMap[code]
    super(
      {
        code,
        ...(opts?.fields && { fields: opts.fields }),
        ...(opts?.params && { params: opts.params }),
        ...(opts?.debug && { debug: opts.debug }),
      } satisfies ApiErrorBody<P, F>,
      status,
    )
  }
}
