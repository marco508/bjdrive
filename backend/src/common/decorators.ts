import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Role } from '@prisma/client'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)

// Injecte l'utilisateur courant (issu du JWT) dans un contrôleur.
export const CurrentUser = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest()
  return data ? req.user?.[data] : req.user
})

export interface JwtUser {
  userId: string
  email: string
  role: Role
  name: string
}
