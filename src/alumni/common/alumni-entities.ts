/** entityType strings used with the shared core AuditService (via AlumniAuditService). */
export const ALUMNI_ENTITY = {
  PROFILE: 'alumni_profile',
  ACCOUNT: 'alumni_account',
  EMPLOYMENT: 'alumni_employment',
  GROUP: 'alumni_group',
  GROUP_MEMBER: 'alumni_group_member',
  EVENT: 'alumni_event',
  REGISTRATION: 'alumni_event_registration',
  EVENT_PAYMENT: 'alumni_event_payment',
  JOB: 'alumni_job',
  APPLICATION: 'alumni_job_application',
  PROGRAM: 'alumni_mentorship_program',
  MENTOR: 'alumni_mentor_profile',
  MATCH: 'alumni_mentorship_match',
  CAMPAIGN: 'alumni_campaign',
  DONATION: 'alumni_donation',
  NEWSLETTER: 'alumni_newsletter',
} as const;
