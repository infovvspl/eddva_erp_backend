/**
 * Default permission catalog for the Admission module. Seeded into
 * `admission_permissions_catalog` on boot (idempotent). Each entry is a
 * `resource` with its available `actions`; roles hold `{resource, actions[]}`
 * rules, and controllers gate routes with @RequirePermission({resource, action}).
 */
export interface ResourceDefinition {
  resource: string;
  name: string;
  description: string;
  available_actions: readonly string[];
}

export const ADMISSION_RESOURCE_CATALOG: readonly ResourceDefinition[] = [
  {
    resource: 'dashboard',
    name: 'Admission Dashboard',
    description: 'View the admission funnel dashboard and KPIs',
    available_actions: ['read'],
  },
  {
    resource: 'sessions',
    name: 'Academic Sessions',
    description: 'Manage the academic sessions admissions are run against',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'programs',
    name: 'Programs',
    description: 'Manage programs/classes being admitted into, and their seats',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'applicants',
    name: 'Applicants',
    description: 'Manage applicant (person) records',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'enquiries',
    name: 'Enquiries & Leads',
    description:
      'Manage enquiries, assign them, log follow-ups and convert them into applications',
    available_actions: [
      'read',
      'create',
      'update',
      'delete',
      'followup',
      'convert',
    ],
  },
  {
    resource: 'applications',
    name: 'Applications',
    description:
      'Manage applications, review them and move them through the admission pipeline',
    available_actions: [
      'read',
      'create',
      'update',
      'delete',
      'review',
      'change_status',
    ],
  },
  {
    resource: 'documents',
    name: 'Application Documents',
    description: 'Upload, download, verify and reject application documents',
    available_actions: ['read', 'upload', 'verify', 'reject'],
  },
  {
    resource: 'application_fees',
    name: 'Application Fees',
    description: 'Record and update application-fee payments',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'tests',
    name: 'Entrance Tests',
    description:
      'Manage entrance tests, register applicants for them and record results',
    available_actions: [
      'read',
      'create',
      'update',
      'register',
      'record_results',
    ],
  },
  {
    resource: 'interviews',
    name: 'Interviews',
    description:
      'Schedule, reschedule and evaluate interviews. `read_assigned` limits visibility to interviews the user is a panelist on',
    available_actions: [
      'read',
      'read_assigned',
      'schedule',
      'reschedule',
      'evaluate',
    ],
  },
  {
    resource: 'merit_lists',
    name: 'Merit Lists',
    description: 'Create, edit and publish merit lists',
    available_actions: ['read', 'create', 'update', 'publish'],
  },
  {
    resource: 'offers',
    name: 'Admission Offers',
    description: 'Issue offers and record their acceptance or decline',
    available_actions: ['read', 'create', 'accept', 'decline'],
  },
  {
    resource: 'fee_structures',
    name: 'Admission Fee Structure',
    description: 'Configure the admission fee per program and session',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'admission_payments',
    name: 'Admission Fee Payments',
    description: 'View and record admission-fee payments',
    available_actions: ['read', 'record'],
  },
  {
    resource: 'confirmations',
    name: 'Admission Confirmations',
    description:
      'Confirm admissions, cancel confirmations and link the created student record',
    available_actions: ['read', 'create', 'cancel', 'link_student'],
  },
  {
    resource: 'reports',
    name: 'Admission Reports',
    description: 'View and export admission reports',
    available_actions: ['read', 'export'],
  },
  {
    resource: 'notifications',
    name: 'Notification Log',
    description: 'View the admission notification outbox',
    available_actions: ['read'],
  },
];
