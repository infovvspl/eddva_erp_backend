/** entityType strings used with the shared core AuditService (via HostelAuditService). */
export const HOSTEL_ENTITY = {
  BLOCK: 'hostel_block',
  ROOM: 'hostel_room',
  BED: 'hostel_bed',
  RESIDENT: 'hostel_resident',
  ALLOTMENT: 'hostel_allotment',
  TRANSFER_REQUEST: 'hostel_transfer_request',
  GATE_PASS: 'hostel_gate_pass',
  ATTENDANCE: 'hostel_attendance',
  VISITOR: 'hostel_visitor',
  MESS_MENU: 'hostel_mess_menu',
  MESS_ATTENDANCE: 'hostel_mess_attendance',
  COMPLAINT: 'hostel_complaint',
  FEE_PLAN: 'hostel_fee_plan',
  INVOICE: 'hostel_fee_invoice',
  PAYMENT: 'hostel_fee_payment',
  DISCIPLINE: 'hostel_discipline_record',
} as const;
