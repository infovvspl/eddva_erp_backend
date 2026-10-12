/** entityType strings used with the shared core AuditService (via StaffAuditService). */
export const STAFF_ENTITY = {
  DEPARTMENT: 'staff_department',
  MEMBER: 'staff_member',
  LEAVE_TYPE: 'staff_leave_type',
  LEAVE_BALANCE: 'staff_leave_balance',
  LEAVE_APPLICATION: 'staff_leave_application',
  SALARY_STRUCTURE: 'staff_salary_structure',
  PAYROLL_RUN: 'staff_payroll_run',
  PAYSLIP: 'staff_payslip',
} as const;
