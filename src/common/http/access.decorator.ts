import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '../../modules/role/domain/role.types';
import { ROLES_KEY } from '../../modules/role/presentation/role.decorator';

export const IS_PUBLIC_KEY = 'is_public';

type AccessOptions = {
  auth?: boolean;
  roles?: Role[];
};

export function Access(options: AccessOptions = {}) {
  const authRequired = options.auth !== false;
  const roles = options.roles ?? [];
  const roleEmojis = roles.map((r) => (r === 'ADMIN' ? `🟣 ${r}` : `🟠 ${r}`)).join(' ');
  const summary = authRequired
    ? roles.length
      ? `🔵 AUTH • ${roleEmojis}`
      : `🔵 AUTH`
    : `🟢 PUBLIC`;

  const decorators: any[] = [
    SetMetadata(IS_PUBLIC_KEY, !authRequired),
    SetMetadata(ROLES_KEY, roles),
    ApiOperation({ summary }),
  ];
  if (authRequired) decorators.push(ApiBearerAuth());
  return applyDecorators(...decorators);
}

export function Public() {
  return Access({ auth: false });
}

export function Authenticated(...roles: Role[]) {
  return Access({ auth: true, roles });
}
