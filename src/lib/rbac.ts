export type Role = "patient" | "doctor" | "practice_admin" | "reception" | "content_editor" | "finance" | "tech_admin";

export type Permission =
  | "appointments:read"
  | "appointments:manage"
  | "appointments:override"
  | "patients:read_contact"
  | "clinical:read"
  | "clinical:write"
  | "clinical:sign"
  | "payments:read"
  | "payments:refund"
  | "pricing:manage"
  | "availability:manage"
  | "content:edit"
  | "content:medical_approve"
  | "content:publish"
  | "analytics:read"
  | "revenue:read"
  | "settings:compliance"
  | "settings:integrations"
  | "users:manage"
  | "audit:read";

/**
 * Least-privilege matrix. Note: reception, content editors, finance and tech admins
 * never receive clinical:* permissions.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  patient: [],
  doctor: [
    "appointments:read",
    "appointments:manage",
    "appointments:override",
    "patients:read_contact",
    "clinical:read",
    "clinical:write",
    "clinical:sign",
    "payments:read",
    "pricing:manage",
    "availability:manage",
    "content:edit",
    "content:medical_approve",
    "content:publish",
    "analytics:read",
    "revenue:read",
    "audit:read",
  ],
  practice_admin: [
    "appointments:read",
    "appointments:manage",
    "appointments:override",
    "patients:read_contact",
    "payments:read",
    "payments:refund",
    "pricing:manage",
    "availability:manage",
    "content:edit",
    "content:publish",
    "analytics:read",
    "revenue:read",
    "users:manage",
    "audit:read",
  ],
  reception: ["appointments:read", "appointments:manage", "patients:read_contact", "availability:manage"],
  content_editor: ["content:edit"],
  finance: ["payments:read", "payments:refund", "revenue:read"],
  tech_admin: ["settings:integrations", "settings:compliance", "users:manage", "audit:read", "analytics:read"],
};

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(permission));
}

export function isStaff(roles: readonly Role[]): boolean {
  return roles.some((r) => r !== "patient");
}
