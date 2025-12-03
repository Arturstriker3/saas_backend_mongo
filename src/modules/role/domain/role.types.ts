export const ROLES = ['ADMIN', 'USER'] as const;
export type Role = (typeof ROLES)[number];

export enum RoleEnum {
  ADMIN = 'ADMIN',
  USER = 'USER',
}
