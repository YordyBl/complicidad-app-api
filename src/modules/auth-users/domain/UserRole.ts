/**
 * User roles for RBAC-ready authorization.
 *
 * V1 does not enforce permissions, but the seam exists:
 * add permission maps, guards, or middleware without
 * changing the User model.
 */
export const USER_ROLES = ['admin', 'manager', 'employee'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Default role assigned to new users. */
export const DEFAULT_ROLE: UserRole = 'employee';
