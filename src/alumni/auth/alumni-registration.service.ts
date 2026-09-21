import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniSystemRoleService } from '../common/alumni-system-role.service';
import { BusinessException } from '../common/business-exception';
import { orConflict } from '../common/unique-violation.util';
import { currentYear } from '../common/validation';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import { AlumniAuthService } from './alumni-auth.service';
import { RegisterAlumniDto } from './dto/register.dto';

const ALREADY_REGISTERED_MESSAGE =
  'An alumni profile already exists for this e-mail or student reference. ' +
  'Log in if you already have an account, or ask the alumni office to enable your portal login.';

/** Years must be real and consistent: batch ≤ graduation ≤ this year. */
export function assertValidYears(
  batchYear: number | null | undefined,
  graduationYear: number | null | undefined,
): void {
  const now = currentYear();
  if (batchYear != null && batchYear > now) {
    throw new BusinessException(
      'INVALID_YEAR',
      `batch_year cannot be in the future (${now})`,
    );
  }
  if (graduationYear != null && graduationYear > now) {
    throw new BusinessException(
      'INVALID_YEAR',
      `graduation_year cannot be in the future (${now})`,
    );
  }
  if (
    batchYear != null &&
    graduationYear != null &&
    graduationYear < batchYear
  ) {
    throw new BusinessException(
      'INVALID_YEAR',
      'graduation_year cannot be earlier than batch_year',
    );
  }
}

/**
 * Alumni self-registration. Creates the directory profile (verification
 * `pending`) and the portal account together, so a self-registered alumnus is
 * always "exactly one account ↔ exactly one profile".
 *
 * Duplicate handling: an existing profile with the same e-mail or the same
 * student reference is NEVER silently claimed. Linking an unauthenticated
 * registrant to a staff-created profile (which may already be verified and
 * carry contact details) would let anyone who knows an e-mail or student id
 * take it over — and this backend has no e-mail provider to prove ownership of
 * the address. The registrant is told to contact the alumni office, who can
 * issue a portal login for the existing profile (`POST profiles/:id/account`).
 */
@Injectable()
export class AlumniRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AlumniAuthService,
    private readonly roles: AlumniSystemRoleService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  async register(dto: RegisterAlumniDto) {
    const instituteId = dto.institute_id;
    assertValidYears(dto.batch_year, dto.graduation_year);

    const [profileClash, usernameClash] = await Promise.all([
      this.prisma.alumniProfile.findFirst({
        where: {
          institute_id: instituteId,
          OR: [
            { email: dto.email },
            ...(dto.student_ref ? [{ student_ref: dto.student_ref }] : []),
          ],
        },
        select: { alumni_id: true },
      }),
      this.prisma.alumniUserDynamicRole.findFirst({
        where: {
          institute_id: instituteId,
          username: { equals: dto.email, mode: 'insensitive' },
        },
        select: { id: true },
      }),
    ]);
    if (profileClash || usernameClash) {
      throw new BusinessException(
        'ALUMNI_ALREADY_REGISTERED',
        ALREADY_REGISTERED_MESSAGE,
        undefined,
        409,
      );
    }

    const password_hash = await bcrypt.hash(dto.password, 10);
    const now = new Date();

    const { profile, assignment } = await orConflict(
      ALREADY_REGISTERED_MESSAGE,
      () =>
        this.prisma.$transaction(async (tx) => {
          const role = await this.roles.ensure(instituteId, tx);
          const created = await tx.alumniProfile.create({
            data: {
              institute_id: instituteId,
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
              source: 'self_registered',
              verification_status: 'pending',
              verification_note: dto.verification_note,
              verification_requested_at: now,
            },
          });
          const account = await tx.alumniUserDynamicRole.create({
            data: {
              institute_id: instituteId,
              eddva_user_id: `alumni-${created.alumni_id}`,
              user_name: created.full_name,
              user_email: created.email,
              username: created.email,
              password_hash,
              role_id: role.role_id,
              alumni_id: created.alumni_id,
            },
            include: { role: true },
          });
          return { profile: created, assignment: account };
        }),
    );

    // Same person, second entry? Flag it for staff without exposing it to the registrant.
    const lookalikes = await this.prisma.alumniProfile.count({
      where: {
        institute_id: instituteId,
        alumni_id: { not: profile.alumni_id },
        full_name: { equals: profile.full_name, mode: 'insensitive' },
        batch_year: profile.batch_year,
      },
    });

    await this.audit.log(
      {
        eddva_user_id: assignment.eddva_user_id,
        institute_id: instituteId,
        user_name: profile.full_name,
        user_role: 'ALUMNI',
        is_institute_admin: false,
        alumni_id: profile.alumni_id,
      },
      {
        entityType: ALUMNI_ENTITY.PROFILE,
        entityId: String(profile.alumni_id),
        action: 'self_register',
        newStatus: 'pending',
        metadata: { email: profile.email, possible_duplicates: lookalikes },
      },
    );
    await this.notifications.notifyAlumni(
      {
        instituteId,
        entityType: ALUMNI_ENTITY.PROFILE,
        entityId: profile.alumni_id,
        eventType: 'registration_received',
        message:
          'Your alumni registration was received and is awaiting verification by the alumni office.',
      },
      { alumni_id: profile.alumni_id, email: profile.email },
    );
    await this.notifications.notifyStaff({
      instituteId,
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: profile.alumni_id,
      eventType: 'verification_requested',
      message: `${profile.full_name} (batch ${profile.batch_year}) registered and awaits verification${
        lookalikes > 0
          ? ` — ${lookalikes} existing profile(s) share this name and batch`
          : ''
      }.`,
    });

    return {
      alumni_id: profile.alumni_id,
      verification_status: profile.verification_status,
      message:
        'Registration received. You can log in now; some features unlock once the alumni office verifies your profile.',
      ...this.auth.buildLogin(assignment),
    };
  }
}
