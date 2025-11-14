import { HttpException } from "@nestjs/common"
import { Request, Response } from "express"
import { ErrorCodes } from "../error-codes"

/**
 * Handle AppError instances that are already formatted.
 */
export function handleAppError(
  exception: HttpException,
  req: Request,
  res: Response,
): boolean {
  const response = exception.getResponse()

  if (typeof response !== "object" || !("code" in response)) {
    return false
  }

  const body = { ...(response as Record<string, unknown>) }

  if (body.code === ErrorCodes.NOT_FOUND) {
    if (!body.params || typeof body.params !== "object") {
      body.params = {}
    }
    const params = body.params as Record<string, unknown>
    if (!params.resource) {
      params.resource = "Endpoint"
    }
  }

  if (process.env.NODE_ENV === "production") {
    delete body.debug
    delete body.path
  } else {
    body.path = req.path
  }

  res.status(exception.getStatus()).json(body)
  return true
}
