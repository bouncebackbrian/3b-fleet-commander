export type BusinessPermission =
  | 'asset_portal_view'
  | 'asset_portal_manage'
  | 'authorized_users_view'
  | 'authorized_users_manage'
  | 'company_profile_view'
  | 'company_profile_manage'
  | 'billing_view'
  | 'billing_manage'
  | 'subscriptions_view'
  | 'subscriptions_manage'
  | 'compliance_view'
  | 'compliance_manage'

export const BUSINESS_PERMISSION_LABELS: Record<BusinessPermission, string> = {
  asset_portal_view: 'View Asset Portal',
  asset_portal_manage: 'Manage Asset Portal',
  authorized_users_view: 'View Authorized Users',
  authorized_users_manage: 'Manage Authorized Users',
  company_profile_view: 'View Company Profile',
  company_profile_manage: 'Manage Company Profile',
  billing_view: 'View Billing',
  billing_manage: 'Manage Billing',
  subscriptions_view: 'View Subscriptions',
  subscriptions_manage: 'Manage Subscriptions',
  compliance_view: 'View Compliance',
  compliance_manage: 'Manage Compliance',
}

/**
 * Fleet portals and business-account permissions are deliberately independent.
 *
 * Examples:
 * - dispatcher employee: dispatch portal only; no company permissions required
 * - office admin: admin portal + selected company permissions
 * - owner: implicit full company-account access + whichever Fleet portals they use
 *
 * Never infer company-account permissions from a Fleet portal grant.
 */
export interface BusinessAccessSnapshot {
  businessId: string
  userId: string
  isOwner: boolean
  permissions: BusinessPermission[]
}

export function hasBusinessPermission(
  access: BusinessAccessSnapshot,
  permission: BusinessPermission,
): boolean {
  return access.isOwner || access.permissions.includes(permission)
}

export function canManageBusinessSection(
  access: BusinessAccessSnapshot,
  section: 'assets' | 'authorized_users' | 'company_profile' | 'billing' | 'subscriptions' | 'compliance',
): boolean {
  const permission = `${section === 'assets' ? 'asset_portal' : section}_manage` as BusinessPermission
  return hasBusinessPermission(access, permission)
}
