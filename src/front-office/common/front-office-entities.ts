/** entityType strings used with the shared core AuditService and FrontOfficeNotificationService. */
export const FO_ENTITY = {
  VISITOR: 'front_office_visitor',
  VISITOR_LOG: 'front_office_visitor_log',
  ENQUIRY: 'front_office_enquiry',
  ENQUIRY_FOLLOWUP: 'front_office_enquiry_followup',
  APPOINTMENT: 'front_office_appointment',
  COMPLAINT: 'front_office_complaint',
  COMPLAINT_UPDATE: 'front_office_complaint_update',
  DEPARTMENT: 'front_office_department',
  EMPLOYEE: 'front_office_employee',
  ATTACHMENT: 'front_office_attachment',
} as const;
