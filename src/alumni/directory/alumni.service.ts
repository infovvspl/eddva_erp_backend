import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AlumniProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { assertValidYears } from '../auth/alumni-registration.service';
import { isAlumniPrincipal } from '../common/alumni-access.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import {
  AlumniFileStorageService,
  IMAGE_RULES,
} from '../common/alumni-file-storage.service';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { AlumniSystemRoleService } from '../common/alumni-system-role.service';
import {
  Viewer,
  canViewProfile,
  fullView,
  publicView,
  viewFor,
  viewerOf,
  visibleProfilesWhere,
} from '../common/alumni-profile.view';
import { BusinessException } from '../common/business-exception';
import {
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import { orConflict } from '../common/unique-violation.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import {
  ALUMNI_SORT_FIELDS,
  CreateAlumniDto,
  IssueAccountDto,
  QueryAlumniDto,
  QueryPublicDirectoryDto,
  RejectAlumniDto,
  SubmitVerificationDto,
  UpdateAlumniDto,
} from './dto/alumni.dto';

const DUPLICATE_MESSAGE =
  'An alumni profile with this e-mail or student reference already exists';

/** Profile fields an alumni portal account may change on its own record. */
const SELF_EDITABLE = new Set([
  'phone',
  'current_company',
  'current_designation',
  'industry',
  'city',
  'country',
  'linkedin_url',
  'visibility',
  'contact_visible',
  'email_opt_in',
  'sms_opt_in',
]);

const VERIFICATION_ACTIONS = [
  'self_register',
  'verification_request',
  'verify',
  'reject',
  'create',
];

@Injectable()
export class AlumniService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
    private readonly roles: AlumniSystemRoleService,
    private readonly files: AlumniFileStorageService,
  ) {}

  /** The alumni id of a portal account; staff accounts have none. */
  private requireOwnId(actor: AlumniPlatformUser): number {
    if (!isAlumniPrincipal(actor)) {
      throw new ForbiddenException(
        'This endpoint is for alumni portal accounts only',
      );
    }
    return actor.alumni_id as number;
  }

  // ─── Create / read / update ──────────────────────────────────────────────

  /** Staff-created alumni (historical students entered by the alumni office). */
  async create(actor: AlumniPlatformUser, dto: CreateAlumniDto) {
    assertValidYears(dto.batch_year, dto.graduation_year);
    await this.assertNoDuplicate(
      actor.institute_id,
      dto.email,
      dto.student_ref,
    );

    const verified = (dto.verification_status ?? 'verified') === 'verified';
    const created = await orConflict(DUPLICATE_MESSAGE, () =>
      this.prisma.alumniProfile.create({
        data: {
          institute_id: actor.institute_id,
          student_ref: dto.student_ref,
          admission_no: dto.admission_no,
          full_name: dto.full_name,
          batch_year: dto.batch_year,
          graduation_year: dto.graduation_year,
          program: dto.program,
          email: dto.email,
          phone: dto.phone,
          current_company: dto.current_company,
          current_designation: dto.current_designation,
          industry: dto.industry,
          city: dto.city,
          country: dto.country,
          linkedin_url: dto.linkedin_url,
          visibility: dto.visibility ?? 'alumni_only',
          contact_visible: dto.contact_visible ?? false,
          email_opt_in: dto.email_opt_in ?? true,
          sms_opt_in: dto.sms_opt_in ?? true,
          source: 'staff_created',
          verification_status: verified ? 'verified' : 'pending',
          verified_at: verified ? new Date() : null,
          verified_by: verified ? actor.eddva_user_id : null,
          created_by: actor.eddva_user_id,
        },
      }),
    );
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: String(created.alumni_id),
      action: 'create',
      newStatus: created.verification_status,
      metadata: { source: 'staff_created', email: created.email },
    });
    return fullView(created);
  }

  private async assertNoDuplicate(
    instituteId: string,
    email: string | undefined,
    studentRef: string | undefined,
    excludeId?: number,
  ) {
    const or: Prisma.AlumniProfileWhereInput[] = [];
    if (email) or.push({ email });
    if (studentRef) or.push({ student_ref: studentRef });
    if (or.length === 0) return;
    const clash = await this.prisma.alumniProfile.findFirst({
      where: {
        institute_id: instituteId,
        OR: or,
        ...(excludeId ? { alumni_id: { not: excludeId } } : {}),
      },
      select: { alumni_id: true, email: true, student_ref: true },
    });
    if (clash) {
      throw new BusinessException(
        'ALUMNI_DUPLICATE',
        DUPLICATE_MESSAGE,
        {
          alumni_id: clash.alumni_id,
          field: clash.email === email ? 'email' : 'student_ref',
        },
        409,
      );
    }
  }

  private searchWhere(
    viewer: Viewer,
    query: QueryAlumniDto,
  ): Prisma.AlumniProfileWhereInput {
    const staff = viewer.kind === 'staff';
    const and: Prisma.AlumniProfileWhereInput[] = [
      visibleProfilesWhere(viewer),
    ];
    const contains = (v: string) => ({
      contains: v,
      mode: 'insensitive' as const,
    });

    if (query.search) {
      const term = query.search.trim();
      and.push({
        OR: [
          { full_name: contains(term) },
          { current_company: contains(term) },
          { current_designation: contains(term) },
          { program: contains(term) },
          { city: contains(term) },
          { industry: contains(term) },
          // E-mail / student ids are only searchable by staff — otherwise a peer
          // could probe for who is registered with a given address.
          ...(staff
            ? [{ email: contains(term) }, { student_ref: contains(term) }]
            : []),
        ],
      });
    }
    if (query.batch_year) and.push({ batch_year: query.batch_year });
    if (query.graduation_year)
      and.push({ graduation_year: query.graduation_year });
    if (query.program) and.push({ program: contains(query.program) });
    if (query.company) and.push({ current_company: contains(query.company) });
    if (query.designation) {
      and.push({ current_designation: contains(query.designation) });
    }
    if (query.industry) and.push({ industry: contains(query.industry) });
    if (query.city) and.push({ city: contains(query.city) });
    if (query.country) and.push({ country: contains(query.country) });
    if (query.group_id) {
      and.push({ group_memberships: { some: { group_id: query.group_id } } });
    }
    if (staff) {
      if (query.verification_status) {
        and.push({ verification_status: query.verification_status });
      }
      if (query.visibility) and.push({ visibility: query.visibility });
      if (query.source) and.push({ source: query.source });
      if (!query.include_inactive) and.push({ is_active: true });
    }
    return { AND: and };
  }

  async findAll(actor: AlumniPlatformUser, query: QueryAlumniDto) {
    const viewer = viewerOf(actor);
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, ALUMNI_SORT_FIELDS, 'full_name');
    const order =
      query.sortOrder ??
      (sortBy === 'full_name' ? 'asc' : parseSortOrder(undefined));
    const where: Prisma.AlumniProfileWhereInput = {
      ...this.searchWhere(viewer, query),
      institute_id: actor.institute_id,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniProfile.findMany({
        where,
        orderBy: [{ [sortBy]: order }, { alumni_id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.alumniProfile.count({ where }),
    ]);
    return {
      data: rows.map((row) => viewFor(viewer, row)),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const viewer = viewerOf(actor);
    const row = await this.lookup.profile(actor.institute_id, id);
    // A profile the viewer may not see is "not found", never "forbidden".
    if (!canViewProfile(viewer, row)) {
      throw new NotFoundException(`Alumni #${id} not found`);
    }
    return viewFor(viewer, row);
  }

  async me(actor: AlumniPlatformUser) {
    const row = await this.lookup.profile(
      actor.institute_id,
      this.requireOwnId(actor),
    );
    return fullView(row);
  }

  /**
   * Staff may change everything; an alumni portal account may change only its
   * own record and only the SELF_EDITABLE fields. Everything else — including
   * identity facts verification vouched for — needs staff.
   */
  async update(actor: AlumniPlatformUser, id: number, dto: UpdateAlumniDto) {
    const changes = Object.entries(dto).filter(([, v]) => v !== undefined);
    if (isAlumniPrincipal(actor)) {
      if (actor.alumni_id !== id) {
        throw new ForbiddenException('You can only modify your own profile');
      }
      const forbidden = changes
        .map(([k]) => k)
        .filter((k) => !SELF_EDITABLE.has(k));
      if (forbidden.length > 0) {
        throw new ForbiddenException(
          `Only alumni-office staff can change: ${forbidden.join(', ')}`,
        );
      }
    }
    const existing = await this.lookup.profile(actor.institute_id, id);
    assertValidYears(
      dto.batch_year ?? existing.batch_year,
      dto.graduation_year ?? existing.graduation_year,
    );
    if (dto.email || dto.student_ref) {
      await this.assertNoDuplicate(
        actor.institute_id,
        dto.email !== existing.email ? dto.email : undefined,
        dto.student_ref !== existing.student_ref ? dto.student_ref : undefined,
        id,
      );
    }

    const data: Prisma.AlumniProfileUpdateInput = Object.fromEntries(changes);
    const updated = await orConflict(DUPLICATE_MESSAGE, () =>
      this.prisma.$transaction(async (tx) => {
        const row = await tx.alumniProfile.update({
          where: { alumni_id: id },
          data,
        });
        if (dto.email && dto.email !== existing.email) {
          // The e-mail is the portal login name — keep the account in step.
          await tx.alumniUserDynamicRole.updateMany({
            where: { alumni_id: id },
            data: { username: dto.email, user_email: dto.email },
          });
        }
        if (dto.full_name && dto.full_name !== existing.full_name) {
          await tx.alumniUserDynamicRole.updateMany({
            where: { alumni_id: id },
            data: { user_name: dto.full_name },
          });
        }
        return row;
      }),
    );
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: String(id),
      action: 'update',
      metadata: { fields: changes.map(([k]) => k) },
    });
    return fullView(updated);
  }

  async deactivate(actor: AlumniPlatformUser, id: number) {
    const row = await this.lookup.profile(actor.institute_id, id);
    if (!row.is_active) return fullView(row);
    const updated = await this.prisma.alumniProfile.update({
      where: { alumni_id: id },
      data: { is_active: false },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: String(id),
      action: 'deactivate',
    });
    return fullView(updated);
  }

  async reactivate(actor: AlumniPlatformUser, id: number) {
    await this.lookup.profile(actor.institute_id, id);
    const updated = await this.prisma.alumniProfile.update({
      where: { alumni_id: id },
      data: { is_active: true },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: String(id),
      action: 'reactivate',
    });
    return fullView(updated);
  }

  // ─── Verification workflow ───────────────────────────────────────────────

  /** Alumnus asks (or re-asks after a rejection) for verification. */
  async submitVerification(
    actor: AlumniPlatformUser,
    dto: SubmitVerificationDto,
  ) {
    const id = this.requireOwnId(actor);
    const existing = await this.lookup.profile(actor.institute_id, id);
    if (existing.verification_status === 'verified') {
      throw new BusinessException(
        'ALREADY_VERIFIED',
        'This profile is already verified',
        undefined,
        409,
      );
    }
    const updated = await this.prisma.alumniProfile.update({
      where: { alumni_id: id },
      data: {
        verification_status: 'pending',
        verification_note: dto.note ?? existing.verification_note,
        verification_requested_at: new Date(),
        rejection_reason: null,
      },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: String(id),
      action: 'verification_request',
      oldStatus: existing.verification_status,
      newStatus: 'pending',
    });
    await this.notifications.notifyStaff({
      instituteId: actor.institute_id,
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: id,
      eventType: 'verification_requested',
      message: `${updated.full_name} (batch ${updated.batch_year}) requested verification.`,
    });
    return this.verificationStatusOf(updated);
  }

  async verificationStatus(actor: AlumniPlatformUser) {
    const row = await this.lookup.profile(
      actor.institute_id,
      this.requireOwnId(actor),
    );
    return this.verificationStatusOf(row);
  }

  private verificationStatusOf(row: AlumniProfile) {
    return {
      alumni_id: row.alumni_id,
      verification_status: row.verification_status,
      requested_at: row.verification_requested_at,
      verified_at: row.verified_at,
      rejection_reason: row.rejection_reason,
      note: row.verification_note,
    };
  }

  async verify(actor: AlumniPlatformUser, id: number) {
    const existing = await this.lookup.profile(actor.institute_id, id);
    // Compare-and-set: two officers verifying at once → exactly one wins.
    const { count } = await this.prisma.alumniProfile.updateMany({
      where: {
        alumni_id: id,
        institute_id: actor.institute_id,
        verification_status: { not: 'verified' },
      },
      data: {
        verification_status: 'verified',
        verified_at: new Date(),
        verified_by: actor.eddva_user_id,
        rejection_reason: null,
      },
    });
    if (count === 0) {
      throw new BusinessException(
        'ALREADY_VERIFIED',
        'This profile is already verified',
        undefined,
        409,
      );
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: String(id),
      action: 'verify',
      oldStatus: existing.verification_status,
      newStatus: 'verified',
    });
    await this.notifications.notifyAlumni(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.PROFILE,
        entityId: id,
        eventType: 'verification_approved',
        message:
          'Your alumni profile has been verified. You can now register for events, apply for jobs and more.',
      },
      { alumni_id: id, email: existing.email },
    );
    return fullView(await this.lookup.profile(actor.institute_id, id));
  }

  async reject(actor: AlumniPlatformUser, id: number, dto: RejectAlumniDto) {
    const existing = await this.lookup.profile(actor.institute_id, id);
    const { count } = await this.prisma.alumniProfile.updateMany({
      where: {
        alumni_id: id,
        institute_id: actor.institute_id,
        verification_status: { not: 'rejected' },
      },
      data: {
        verification_status: 'rejected',
        rejection_reason: dto.reason ?? null,
        verified_at: null,
        verified_by: null,
      },
    });
    if (count === 0) {
      throw new BusinessException(
        'ALREADY_REJECTED',
        'This profile is already rejected',
        undefined,
        409,
      );
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: String(id),
      action: 'reject',
      oldStatus: existing.verification_status,
      newStatus: 'rejected',
      reason: dto.reason,
    });
    await this.notifications.notifyAlumni(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.PROFILE,
        entityId: id,
        eventType: 'verification_rejected',
        message: `Your alumni verification was not approved${
          dto.reason ? `: ${dto.reason}` : '.'
        }`,
      },
      { alumni_id: id, email: existing.email },
    );
    return fullView(await this.lookup.profile(actor.institute_id, id));
  }

  /** Newest-first verification history, from the shared audit trail. */
  async verificationHistory(actor: AlumniPlatformUser, id: number) {
    await this.lookup.profile(actor.institute_id, id);
    const trail = await this.audit.trail(ALUMNI_ENTITY.PROFILE, id, 500);
    return trail.filter((entry) => VERIFICATION_ACTIONS.includes(entry.action));
  }

  /**
   * Profiles that might be the same person (same name and batch, or same
   * phone) — for staff to review. Deliberately NOT auto-merged: name matching
   * is unreliable, so this only surfaces candidates.
   */
  async possibleDuplicates(actor: AlumniPlatformUser, id: number) {
    const row = await this.lookup.profile(actor.institute_id, id);
    const rows = await this.prisma.alumniProfile.findMany({
      where: {
        institute_id: actor.institute_id,
        alumni_id: { not: id },
        OR: [
          {
            full_name: { equals: row.full_name, mode: 'insensitive' },
            batch_year: row.batch_year,
          },
          ...(row.phone ? [{ phone: row.phone }] : []),
        ],
      },
      take: 25,
    });
    return rows.map((r) => ({
      ...fullView(r),
      matched_on: [
        r.full_name.toLowerCase() === row.full_name.toLowerCase() &&
        r.batch_year === row.batch_year
          ? 'name_and_batch'
          : null,
        row.phone && r.phone === row.phone ? 'phone' : null,
      ].filter(Boolean),
    }));
  }

  // ─── Portal account ──────────────────────────────────────────────────────

  /**
   * Staff issue (or reset) the portal login of an existing profile — the safe
   * route for a historical alumnus whose profile was entered by staff. The
   * e-mail is the login name; one account per profile.
   */
  async issueAccount(
    actor: AlumniPlatformUser,
    id: number,
    dto: IssueAccountDto,
  ) {
    const profile = await this.lookup.profile(actor.institute_id, id);
    if (!profile.is_active) {
      throw new BusinessException(
        'ALUMNI_INACTIVE',
        'Reactivate this profile before issuing a login',
      );
    }
    const usernameOwner = await this.prisma.alumniUserDynamicRole.findFirst({
      where: {
        institute_id: actor.institute_id,
        username: { equals: profile.email, mode: 'insensitive' },
        NOT: { alumni_id: id },
      },
      select: { id: true },
    });
    if (usernameOwner) {
      throw new BusinessException(
        'USERNAME_TAKEN',
        'Another account already uses this e-mail as its login name',
        undefined,
        409,
      );
    }
    const password_hash = await bcrypt.hash(dto.password, 10);
    const account = await orConflict(
      'This profile already has a login being created; retry',
      () =>
        this.prisma.$transaction(async (tx) => {
          const role = await this.roles.ensure(actor.institute_id, tx);
          const existing = await tx.alumniUserDynamicRole.findUnique({
            where: { alumni_id: id },
          });
          if (existing) {
            return tx.alumniUserDynamicRole.update({
              where: { id: existing.id },
              data: { password_hash, is_active: true },
            });
          }
          return tx.alumniUserDynamicRole.create({
            data: {
              institute_id: actor.institute_id,
              eddva_user_id: `alumni-${id}`,
              user_name: profile.full_name,
              user_email: profile.email,
              username: profile.email,
              password_hash,
              role_id: role.role_id,
              alumni_id: id,
            },
          });
        }),
    );
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.ACCOUNT,
      entityId: String(id),
      action: 'issue_account',
      metadata: { username: account.username },
    });
    return {
      alumni_id: id,
      username: account.username,
      is_active: account.is_active,
    };
  }

  // ─── Public directory & photo ────────────────────────────────────────────

  /** Unauthenticated directory card list: public + verified profiles only, no contact details. */
  async publicDirectory(query: QueryPublicDirectoryDto) {
    const { skip, take, page, limit } = parsePagination({
      page: query.page,
      limit: Math.min(query.limit ?? 20, 50),
    });
    const contains = (v: string) => ({
      contains: v,
      mode: 'insensitive' as const,
    });
    const where: Prisma.AlumniProfileWhereInput = {
      institute_id: query.institute_id,
      ...visibleProfilesWhere({ kind: 'public' }),
      ...(query.search ? { full_name: contains(query.search.trim()) } : {}),
      ...(query.batch_year ? { batch_year: query.batch_year } : {}),
      ...(query.program ? { program: contains(query.program) } : {}),
      ...(query.industry ? { industry: contains(query.industry) } : {}),
      ...(query.city ? { city: contains(query.city) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniProfile.findMany({
        where,
        orderBy: [{ batch_year: 'desc' }, { full_name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.alumniProfile.count({ where }),
    ]);
    return {
      data: rows.map((row) => publicView(row)),
      pagination: buildMeta(total, page, limit),
    };
  }

  async uploadPhoto(
    actor: AlumniPlatformUser,
    id: number,
    file: Express.Multer.File | undefined,
  ) {
    if (isAlumniPrincipal(actor) && actor.alumni_id !== id) {
      throw new ForbiddenException('You can only change your own photo');
    }
    const profile = await this.lookup.profile(actor.institute_id, id);
    const stored = await this.files.save(
      actor.institute_id,
      'photos',
      file,
      IMAGE_RULES,
    );
    try {
      await this.prisma.alumniProfile.update({
        where: { alumni_id: id },
        data: { photo_path: stored.path, photo_mime: stored.mime },
      });
    } catch (err) {
      await this.files.remove(stored.path); // don't orphan the file if the row failed
      throw err;
    }
    await this.files.remove(profile.photo_path);
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: String(id),
      action: 'update',
      metadata: { fields: ['photo'] },
    });
    return { alumni_id: id, has_photo: true };
  }

  /** Streams a photo only to viewers who may see the profile. */
  async photoForDownload(actor: AlumniPlatformUser, id: number) {
    const viewer = viewerOf(actor);
    const row = await this.lookup.profile(actor.institute_id, id);
    if (
      !canViewProfile(viewer, row) ||
      !row.photo_path ||
      !row.photo_mime ||
      !(await this.files.exists(row.photo_path))
    ) {
      throw new NotFoundException('Photo not found');
    }
    return {
      absolutePath: this.files.resolve(row.photo_path),
      mime: row.photo_mime,
    };
  }
}
