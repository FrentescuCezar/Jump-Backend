import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { Request, Response } from "express"
import { ErrorCodes } from "./error-codes"
import {
  handleAppError,
  handlePrismaDuplicate,
  handlePrismaNotFound,
  handleHttpException,
} from "./handlers"

/**
 * Converts ANY thrown value into the ApiErrorBody envelope.
 * Order:
 *   1. AppError         → pass through
 *   2. Prisma P2002     → DUPLICATE + field list
 *   3. Prisma P2025     → NOT_FOUND
 *   4. Other HttpError  → map status → code
 *   5. Fallback         → INTERNAL 500
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>()
    const req = host.switchToHttp().getRequest<Request>()

    console.error(
      `[${new Date().toISOString()}] Error at ${req.method} ${req.url}:`,
      exception instanceof Error ? exception.stack : exception,
    )

    /* 1 ─ already formatted by AppError */
    if (
      exception instanceof HttpException &&
      handleAppError(exception, req, res)
    ) {
      return
    }

    /* 2 ─ Prisma unique constraint (duplicate key) */
    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      handlePrismaDuplicate(exception, res)
    ) {
      return
    }

    /* 2.2 ─ Prisma Record not found */
    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      handlePrismaNotFound(exception, res)
    ) {
      return
    }

    /* 3 ─ Generic NestJS HttpException */
    if (exception instanceof HttpException) {
      handleHttpException(exception, res)
      return
    }

    /* 4 ─ Anything else → 500 */
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ code: ErrorCodes.INTERNAL })
  }
}
