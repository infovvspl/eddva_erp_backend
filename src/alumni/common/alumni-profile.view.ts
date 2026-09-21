import { AlumniProfile, Prisma } from '@prisma/client';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { isAlumniPrincipal } from './alumni-access.service';

/**
 * Who is looking at an alumni record. Privacy is decided here, once, so every
 * module that shows alumni (directory, mentors, applicants, donors, …) applies
 * the same rules:
 *  - staff:  everything (still minus internal storage paths)
 *  - self:   own record, everything
 *  - peer:   another alumni portal account — verified profiles only, honouring
 *            visibility, and contact details only if the owner allows it
 *  - public: unauthenticated — public + verified profiles, never contact details
 */
export type Viewer =
  | { kind: 'staff' }
  | { kind: 'alumni'; alumniId: number; verified: boolean }
  | { kind: 'public' };

export function viewerOf(actor: AlumniPlatformUser): Viewer {
  return isAlumniPrincipal(actor)
    ? {
        kind: 'alumni',
        alumniId: actor.alumni_id as number,
        verified: actor.alumni_verified === true,
      }
    : { kind: 'staff' };
}

/** Columns safe to show anyone who may see the profile at all. */
export const ALUMNI_SUMMARY_SELECT = {
  alumni_id: true,
  full_name: true,
  batch_year: true,
  graduation_year: true,
  program: true,
  current_company: true,
  current_designation: true,
  industry: true,
  city: true,
  country: true,
} satisfies Prisma.AlumniProfileSelect;

export type AlumniSummary = Prisma.AlumniProfileGetPayload<{
  select: typeof ALUMNI_SUMMARY_SELECT;
}>;

/** Summary + contact columns; contact is stripped again by `summaryFor` unless allowed. */
export const ALUMNI_CONTACT_SELECT = {
  ...ALUMNI_SUMMARY_SELECT,
  email: true,
  phone: true,
  contact_visible: true,
} satisfies Prisma.AlumniProfileSelect;

type WithContact = Prisma.AlumniProfileGetPayload<{
  select: typeof ALUMNI_CONTACT_SELECT;
}>;

/** Summary of an alumnus for a listing; e-mail/phone only for staff or the owner's own consent. */
export function summaryFor(viewer: Viewer, row: WithContact) {
  const { email, phone, contact_visible, ...summary } = row;
  const isSelf = viewer.kind === 'alumni' && viewer.alumniId === row.alumni_id;
  if (
    viewer.kind === 'staff' ||
    isSelf ||
    (viewer.kind === 'alumni' && contact_visible)
  ) {
    return { ...summary, email, phone };
  }
  return summary;
}

/** SQL filter for the profiles a viewer may see in the directory. */
export function visibleProfilesWhere(
  viewer: Viewer,
): Prisma.AlumniProfileWhereInput {
  if (viewer.kind === 'staff') return {};
  if (viewer.kind === 'public') {
    return {
      is_active: true,
      verification_status: 'verified',
      visibility: 'public',
    };
  }
  const visibleTo: Array<'public' | 'alumni_only'> = viewer.verified
    ? ['public', 'alumni_only']
    : ['public'];
  return {
    OR: [
      { alumni_id: viewer.alumniId },
      {
        is_active: true,
        verification_status: 'verified',
        visibility: { in: visibleTo },
      },
    ],
  };
}

/** In-memory twin of `visibleProfilesWhere` for single-record checks. */
export function canViewProfile(
  viewer: Viewer,
  row: Pick<
    AlumniProfile,
    'alumni_id' | 'is_active' | 'verification_status' | 'visibility'
  >,
): boolean {
  if (viewer.kind === 'staff') return true;
  if (viewer.kind === 'alumni' && viewer.alumniId === row.alumni_id)
    return true;
  if (!row.is_active || row.verification_status !== 'verified') return false;
  if (row.visibility === 'public') return true;
  return (
    viewer.kind === 'alumni' &&
    viewer.verified &&
    row.visibility === 'alumni_only'
  );
}

/** Internal storage columns never leave the server. */
function stripInternal(row: AlumniProfile) {
  const { photo_path, photo_mime, ...rest } = row;
  return { ...rest, has_photo: Boolean(photo_path && photo_mime) };
}

/** The owner / staff view: every column except internal storage paths. */
export function fullView(row: AlumniProfile) {
  return stripInternal(row);
}

/** What one alumnus sees of another (or of themselves — see `viewFor`). */
export function peerView(row: AlumniProfile) {
  return {
    alumni_id: row.alumni_id,
    full_name: row.full_name,
    batch_year: row.batch_year,
    graduation_year: row.graduation_year,
    program: row.program,
    current_company: row.current_company,
    current_designation: row.current_designation,
    industry: row.industry,
    city: row.city,
    country: row.country,
    linkedin_url: row.linkedin_url,
    has_photo: Boolean(row.photo_path && row.photo_mime),
    verification_status: row.verification_status,
    ...(row.contact_visible ? { email: row.email, phone: row.phone } : {}),
  };
}

/** The unauthenticated directory card: no e-mail, phone or LinkedIn. */
export function publicView(row: AlumniProfile) {
  return {
    alumni_id: row.alumni_id,
    full_name: row.full_name,
    batch_year: row.batch_year,
    graduation_year: row.graduation_year,
    program: row.program,
    current_company: row.current_company,
    current_designation: row.current_designation,
    industry: row.industry,
    city: row.city,
    country: row.country,
    has_photo: Boolean(row.photo_path && row.photo_mime),
  };
}

export function viewFor(viewer: Viewer, row: AlumniProfile) {
  if (viewer.kind === 'staff') return fullView(row);
  if (viewer.kind === 'alumni' && viewer.alumniId === row.alumni_id) {
    return fullView(row);
  }
  return viewer.kind === 'public' ? publicView(row) : peerView(row);
}
