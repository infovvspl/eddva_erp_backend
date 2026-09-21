/**
 * Default permission catalog for the Alumni module. Seeded into
 * `alumni_permissions_catalog` on boot (idempotent). Each entry is a
 * `resource` with its available `actions`; roles hold `{resource, actions[]}`
 * rules, and controllers gate routes with @RequirePermission({resource, action}).
 *
 * Roles (created by the Institute Admin, except the system "Alumni" role):
 *  - Alumni Relations Officer: everything operational (directory, verification,
 *    groups, events, jobs moderation, mentorship, campaigns, donations,
 *    newsletters, reports).
 *  - Alumni (system role, `ALUMNI_SELF_SERVICE_RULES`): self-service portal
 *    access. An account linked to an alumni record is ALWAYS self-scoped by the
 *    services (own profile / registrations / applications / donations), no
 *    matter which permissions its role holds, and can never use `@StaffOnly`
 *    routes.
 *  - Finance / Events / Communications staff: any subset of the matrix.
 */
export interface ResourceDefinition {
  resource: string;
  name: string;
  description: string;
  available_actions: readonly string[];
}

export const ALUMNI_RESOURCE_CATALOG: readonly ResourceDefinition[] = [
  {
    resource: 'dashboard',
    name: 'Alumni Dashboard',
    description: 'View alumni dashboard statistics',
    available_actions: ['read'],
  },
  {
    resource: 'alumni',
    name: 'Alumni Directory',
    description:
      'Directory, profiles, search, verification and portal accounts',
    available_actions: [
      'read',
      'create',
      'update',
      'delete',
      'verify',
      'issue_account',
      'export',
    ],
  },
  {
    resource: 'employment',
    name: 'Employment History',
    description: 'Manage alumni career timelines',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'groups',
    name: 'Alumni Groups',
    description: 'Batch / program / location / interest groups and members',
    available_actions: ['read', 'create', 'update', 'delete', 'manage_members'],
  },
  {
    resource: 'events',
    name: 'Alumni Events',
    description: 'Create, update, cancel and view events',
    available_actions: ['read', 'create', 'update', 'delete', 'cancel'],
  },
  {
    resource: 'event_registrations',
    name: 'Event Registrations & Attendance',
    description: 'Register for events, cancel, mark attendance',
    available_actions: ['read', 'create', 'cancel', 'attendance'],
  },
  {
    resource: 'event_payments',
    name: 'Event Payments',
    description: 'Record and view ticket payments for paid events',
    available_actions: ['read', 'create'],
  },
  {
    resource: 'jobs',
    name: 'Job Board',
    description: 'Post, edit, close and browse job postings',
    available_actions: ['read', 'create', 'update', 'delete', 'close'],
  },
  {
    resource: 'job_applications',
    name: 'Job Applications',
    description: 'Apply, withdraw, review and update application status',
    available_actions: ['read', 'create', 'update', 'withdraw'],
  },
  {
    resource: 'mentorship_programs',
    name: 'Mentorship Programs',
    description: 'Manage mentorship programs',
    available_actions: ['read', 'create', 'update', 'close'],
  },
  {
    resource: 'mentors',
    name: 'Mentor Profiles',
    description: 'Become a mentor, set availability, browse mentors',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'mentorship_matches',
    name: 'Mentor-Mentee Matches',
    description: 'Match mentors with mentees and manage match status',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'campaigns',
    name: 'Fundraising Campaigns',
    description: 'Manage fundraising campaigns',
    available_actions: ['read', 'create', 'update', 'close'],
  },
  {
    resource: 'donations',
    name: 'Donations',
    description:
      'Pledge/record donations, confirm receipt of money, reverse donations',
    available_actions: ['read', 'create', 'confirm', 'reverse'],
  },
  {
    resource: 'receipts',
    name: 'Donation Receipts',
    description: 'View and download donation receipts',
    available_actions: ['read'],
  },
  {
    resource: 'newsletters',
    name: 'Newsletters',
    description: 'Author newsletters, preview recipients and send them',
    available_actions: ['read', 'create', 'update', 'delete', 'send'],
  },
  {
    resource: 'communication',
    name: 'Communication Logs',
    description:
      'View delivery logs and statistics; record provider delivery callbacks',
    available_actions: ['read', 'update'],
  },
  {
    resource: 'reports',
    name: 'Alumni Reports',
    description: 'Run and export alumni reports',
    available_actions: ['read', 'export'],
  },
  {
    resource: 'notifications',
    name: 'Notification Log',
    description: 'View the alumni notification outbox',
    available_actions: ['read'],
  },
];

/**
 * Permissions of the auto-created system "Alumni" role. Deliberately narrow:
 * no verification, no staff data, no newsletters, no reports.
 */
export const ALUMNI_SELF_SERVICE_RULES: readonly {
  resource: string;
  actions: readonly string[];
}[] = [
  { resource: 'alumni', actions: ['read', 'update'] },
  { resource: 'employment', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'groups', actions: ['read'] },
  { resource: 'events', actions: ['read'] },
  { resource: 'event_registrations', actions: ['read', 'create', 'cancel'] },
  { resource: 'event_payments', actions: ['read'] },
  {
    resource: 'jobs',
    actions: ['read', 'create', 'update', 'delete', 'close'],
  },
  {
    resource: 'job_applications',
    actions: ['read', 'create', 'update', 'withdraw'],
  },
  { resource: 'mentorship_programs', actions: ['read'] },
  { resource: 'mentors', actions: ['read', 'create', 'update'] },
  { resource: 'mentorship_matches', actions: ['read'] },
  { resource: 'campaigns', actions: ['read'] },
  { resource: 'donations', actions: ['read', 'create'] },
  { resource: 'receipts', actions: ['read'] },
  { resource: 'notifications', actions: ['read'] },
];

export const ALUMNI_SYSTEM_ROLE_NAME = 'Alumni';
