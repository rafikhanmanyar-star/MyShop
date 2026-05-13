import type { TenantRequest } from '../../middleware/tenantMiddleware.js';
import type { Response, NextFunction } from 'express';

export type ReportPermission =
  | 'reports.view'
  | 'reports.export'
  | 'reports.financial'
  | 'reports.audit'
  | 'reports.custom'
  | 'reports.ai';

const ACCOUNTANT: ReportPermission[] = [
  'reports.view',
  'reports.export',
  'reports.financial',
  'reports.custom',
  'reports.ai',
];

const ADMIN: ReportPermission[] = [
  'reports.view',
  'reports.export',
  'reports.financial',
  'reports.audit',
  'reports.custom',
  'reports.ai',
];

const ROLE_MATRIX: Record<string, Set<ReportPermission>> = {
  admin: new Set(ADMIN),
  accountant: new Set(ACCOUNTANT),
  pos_cashier: new Set(),
};

export function roleHasReportPermission(role: string | undefined, perm: ReportPermission): boolean {
  if (!role) return false;
  return ROLE_MATRIX[role]?.has(perm) ?? false;
}

export function requireReportPermission(perm: ReportPermission) {
  return (req: TenantRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!roleHasReportPermission(role, perm)) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'REPORT_PERMISSION_DENIED',
        permission: perm,
      });
    }
    next();
  };
}
