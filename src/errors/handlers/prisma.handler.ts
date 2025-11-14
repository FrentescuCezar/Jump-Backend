import { HttpStatus } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { Response } from "express"
import { ErrorCodes, FieldErrorCodes } from "../error-codes"

/**
 * Handle Prisma unique constraint violations (P2002).
 */
export function handlePrismaDuplicate(
  exception: Prisma.PrismaClientKnownRequestError,
  res: Response,
): boolean {
  if (exception.code !== "P2002" || !Array.isArray(exception.meta?.target)) {
    return false
  }

  const fields = (exception.meta.target as string[]).map((f) => ({
    field: f,
    code: FieldErrorCodes.DUPLICATE,
  }))

  res.status(HttpStatus.CONFLICT).json({ code: ErrorCodes.CONFLICT, fields })
  return true
}

/**
 * Handle Prisma record not found errors (P2025).
 */
export function handlePrismaNotFound(
  exception: Prisma.PrismaClientKnownRequestError,
  res: Response,
): boolean {
  if (exception.code !== "P2025") {
    return false
  }

  res.status(HttpStatus.NOT_FOUND).json({
    code: ErrorCodes.NOT_FOUND,
    params: { resource: "Record" },
  })
  return true
}
