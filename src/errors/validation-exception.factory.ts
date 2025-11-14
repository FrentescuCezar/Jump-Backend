import { ValidationError } from "class-validator"
import { AppError } from "./app-error"
import { ErrorCodes, FieldErrorCodes } from "./error-codes"

export function validationExceptionFactory(
  validationErrors: ValidationError[],
) {
  const fields = validationErrors.flatMap((err) =>
    Object.keys(err.constraints ?? {}).map((rule) => ({
      field: err.property,
      code: FieldErrorCodes.INVALID,
      params: { constraint: rule },
    })),
  )

  return new AppError(ErrorCodes.VALIDATION, { fields })
}
