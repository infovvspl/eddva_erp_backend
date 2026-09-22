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
import { AlumniPlatformUser } from './alumni-auth.service';
import { RegisterAlumniDto } from './dto/register.dto';

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
 * Creates an alumni profile and its portal login account together, in one
 * transaction — the staff-facing counterpart of `AlumniService.issueAccount`
 * (which adds a login to a profile that already exists). There is no public
 * self-registration in this backend: an alumnus never proves ownership of an
 * e-mail address to us (no e-mail provider exists here), so nobody
 * unauthenticated is ever allowed to create or claim a profile. The caller is
 * always staff — an Institute Admin, or a role holding `alumni:create` +
 * `alumni:issue_account` — and the institute is taken from their own session,
 * never from the request body.
 *
 * Deliberately returns no login token for the new account: the response goes
 * to the STAFF member who created it, and handing back a usable session for
 * someone else's account would let staff silently impersonate any alumnus
 * they create. The alumnus logs in themselves with the credentials staff set.
 */
@Injectable()
export class AlumniRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: AlumniSystemRoleService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  async register(actor: AlumniPlatformUser, dto: RegisterAlumniDto) {
    const instituteId = actor.institute_id;
    assertValidYears(dto.batch_year, dto.graduation_year);

    const clash = await this.prisma.alumniProfile.findFirst({
      where: {
        institute_id: instituteId,
        OR: [
          { email: dto.email },
          ...(dto.student_ref ? [{ student_ref: dto.student_ref }] : []),
        ],
      },
      select: { alumni_id: true, email: true, student_ref: true },
    });
    if (clash) {
      throw new BusinessException(
        'ALUMNI_DUPLICATE',
        'An alumni profile with this e-mail or student reference already exists',
        {
          alumni_id: clash.alumni_id,
          field: clash.email === dto.email ? 'email' : 'student_ref',
        },
        409,
      );
    }

    const password_hash = await bcrypt.hash(dto.password, 10);
    const verified = (dto.verification_status ?? 'verified') === 'verified';
    const now = new Date();

    const { profile, assignment } = await orConflict(
      'An alumni profile with this e-mail or student reference already exists',
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
              source: 'staff_created',
              verification_status: verified ? 'verified' : 'pending',
              verification_note: dto.verification_note,
              verification_requested_at: verified ? null : now,
              verified_at: verified ? now : null,
              verified_by: verified ? actor.eddva_user_id : null,
              created_by: actor.eddva_user_id,
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

    // Same person, second entry? Flag it in the response for staff to review — never auto-merged.
    const lookalikes = await this.prisma.alumniProfile.count({
      where: {
        institute_id: instituteId,
        alumni_id: { not: profile.alumni_id },
        full_name: { equals: profile.full_name, mode: 'insensitive' },
        batch_year: profile.batch_year,
      },
    });

    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.PROFILE,
      entityId: String(profile.alumni_id),
      action: 'create',
      newStatus: profile.verification_status,
      metadata: {
        source: 'staff_created',
        email: profile.email,
        account_issued: true,
        possible_duplicates: lookalikes,
      },
    });
    await this.notifications.notifyAlumni(
      {
        instituteId,
        entityType: ALUMNI_ENTITY.PROFILE,
        entityId: profile.alumni_id,
        eventType: 'account_created',
        message: verified
          ? 'An alumni account has been created for you. You can now log in with your registered e-mail.'
          : 'An alumni account has been created for you and is awaiting verification by the alumni office.',
      },
      { alumni_id: profile.alumni_id, email: profile.email },
    );

    return {
      alumni_id: profile.alumni_id,
      verification_status: profile.verification_status,
      account: { username: assignment.username },
      possible_duplicates: lookalikes,
    };
  }
}
