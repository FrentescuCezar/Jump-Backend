import { HttpException } from "@nestjs/common"
import { Response } from "express"
import { ErrorCodes, StatusToErrorCode } from "../error-codes"

/**
 * Handle generic NestJS HttpExceptions.
 */
export function handleHttpException(
  exception: HttpException,
  res: Response,
): void {
  const status = exception.getStatus()
  const code = StatusToErrorCode[status] ?? ErrorCodes.INTERNAL

  const responseBody: Record<string, unknown> = { code }
  if (code === ErrorCodes.NOT_FOUND) {
    responseBody.params = { resource: "Endpoint" }
  }

  res.status(status).json(responseBody)
}
