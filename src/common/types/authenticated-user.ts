export type AuthenticatedUser = {
  sub: string
  email?: string
  preferred_username?: string
  given_name?: string
  family_name?: string
  name?: string
  [key: string]: unknown
}
