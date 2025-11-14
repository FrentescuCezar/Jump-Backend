import type { Request } from "express"
import type { KeycloakPrincipal } from "./keycloak-user.type"

/**
 * Express Request extended with authenticated Keycloak user.
 * Use this type for controller methods that require authentication.
 *
 * @example
 * ```ts
 * import { Req } from "@nestjs/common"
 * import type { AuthenticatedRequest } from "@/keycloak/authenticated-request.type"
 *
 * @Get("profile")
 * getProfile(@Req() req: AuthenticatedRequest) {
 *   return { userId: req.user.sub }
 * }
 * ```
 */
export interface AuthenticatedRequest extends Request {
  user: KeycloakPrincipal
}

