-- Fleet Commander
-- Driver pay and payroll administration are company/admin concerns, not dispatch concerns.
-- Dispatch may see operational time/status needed to coordinate work, but not wage rates,
-- payroll totals, tax data, pay reconciliation, or payroll approvals unless explicitly granted.

alter table public.business_member_permissions
  drop constraint if exists business_member_permissions_permission_check;

alter table public.business_member_permissions
  add constraint business_member_permissions_permission_check
  check (permission in (
    'asset_portal_view',
    'asset_portal_manage',
    'authorized_users_view',
    'authorized_users_manage',
    'company_profile_view',
    'company_profile_manage',
    'billing_view',
    'billing_manage',
    'subscriptions_view',
    'subscriptions_manage',
    'compliance_view',
    'compliance_manage',
    'driver_pay_view',
    'driver_pay_manage',
    'payroll_settings_view',
    'payroll_settings_manage'
  ));

-- Canonical Fleet portal rule:
-- admin portal does NOT imply dispatch, and dispatch does NOT imply admin.
-- Pay/payroll visibility is enforced through company permissions above.

notify pgrst, 'reload schema';
