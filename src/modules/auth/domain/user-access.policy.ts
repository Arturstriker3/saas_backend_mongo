import { RoleEnum } from '../../role/domain/role.types';
import type { UserEntity } from '../../user/domain/user.entity';

type UserAccessTarget = Pick<UserEntity, 'isActive' | 'role'>;

export function isInactiveUserBlocked(user: UserAccessTarget): boolean {
  return !user.isActive && user.role !== RoleEnum.ADMIN;
}
