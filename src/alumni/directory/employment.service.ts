import { ForbiddenException, Injectable } from '@nestjs/common';
import { AlumniEmployment, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { isAlumniPrincipal } from '../common/alumni-access.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { canViewProfile, viewerOf } from '../common/alumni-profile.view';
import { BusinessException } from '../common/business-exception';
import { parseDateOnly } from '../common/time.util';
import { NotFoundException } from '@nestjs/common';
import { CreateEmploymentDto, UpdateEmploymentDto } from './dto/employment.dto';

function later(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

@Injectable()
export class EmploymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
  ) {}

  /** Own record or staff; an alumnus can never touch someone else's timeline. */
  private assertCanManage(actor: AlumniPlatformUser, alumniId: number) {
    if (isAlumniPrincipal(actor) && actor.alumni_id !== alumniId) {
      throw new ForbiddenException(
        'You can only manage your own employment history',
      );
    }
  }

  private assertDates(start: Date, end: Date | null, isCurrent: boolean): void {
    if (isCurrent && end) {
      throw new BusinessException(
        'INVALID_EMPLOYMENT_DATES',
        'A current position cannot have an end_date',
      );
    }
    if (!isCurrent && !end) {
      throw new BusinessException(
        'INVALID_EMPLOYMENT_DATES',
        'end_date is required unless the position is current',
      );
    }
    if (end && end.getTime() < start.getTime()) {
      throw new BusinessException(
        'INVALID_EMPLOYMENT_DATES',
        'end_date cannot be earlier than start_date',
      );
    }
  }

  /** Closes the alumnus's other current position(s) so at most one stays current. */
  private async closeOtherCurrent(
    tx: Prisma.TransactionClient,
    alumniId: number,
    newStart: Date,
    exceptId?: number,
  ) {
    const others = await tx.alumniEmployment.findMany({
      where: {
        alumni_id: alumniId,
        is_current: true,
        is_active: true,
        ...(exceptId ? { employment_id: { not: exceptId } } : {}),
      },
    });
    for (const other of others) {
      await tx.alumniEmployment.update({
        where: { employment_id: other.employment_id },
        data: {
          is_current: false,
          end_date: later(other.start_date, newStart),
        },
      });
    }
  }

  /** The profile's searchable "current company/designation" follows the current position. */
  private async syncProfile(
    tx: Prisma.TransactionClient,
    alumniId: number,
    emp: AlumniEmployment,
  ) {
    await tx.alumniProfile.update({
      where: { alumni_id: alumniId },
      data: {
        current_company: emp.company,
        current_designation: emp.designation,
        ...(emp.industry ? { industry: emp.industry } : {}),
      },
    });
  }

  async findAll(actor: AlumniPlatformUser, alumniId: number) {
    await this.assertCanView(actor, alumniId);
    return this.prisma.alumniEmployment.findMany({
      where: {
        alumni_id: alumniId,
        institute_id: actor.institute_id,
        is_active: true,
      },
      orderBy: [{ is_current: 'desc' }, { start_date: 'desc' }],
    });
  }

  async current(actor: AlumniPlatformUser, alumniId: number) {
    await this.assertCanView(actor, alumniId);
    const row = await this.prisma.alumniEmployment.findFirst({
      where: {
        alumni_id: alumniId,
        institute_id: actor.institute_id,
        is_current: true,
        is_active: true,
      },
    });
    if (!row) throw new NotFoundException('No current employment on record');
    return row;
  }

  private async assertCanView(actor: AlumniPlatformUser, alumniId: number) {
    const profile = await this.lookup.profile(actor.institute_id, alumniId);
    if (!canViewProfile(viewerOf(actor), profile)) {
      throw new NotFoundException(`Alumni #${alumniId} not found`);
    }
  }

  async create(
    actor: AlumniPlatformUser,
    alumniId: number,
    dto: CreateEmploymentDto,
  ) {
    this.assertCanManage(actor, alumniId);
    await this.lookup.profile(actor.institute_id, alumniId);
    const start = parseDateOnly(dto.start_date, 'start_date');
    const end = dto.end_date ? parseDateOnly(dto.end_date, 'end_date') : null;
    const isCurrent = dto.is_current ?? false;
    this.assertDates(start, end, isCurrent);

    const created = await this.prisma.$transaction(async (tx) => {
      if (isCurrent) await this.closeOtherCurrent(tx, alumniId, start);
      const row = await tx.alumniEmployment.create({
        data: {
          institute_id: actor.institute_id,
          alumni_id: alumniId,
          company: dto.company,
          designation: dto.designation,
          industry: dto.industry,
          location: dto.location,
          start_date: start,
          end_date: end,
          is_current: isCurrent,
        },
      });
      if (isCurrent) await this.syncProfile(tx, alumniId, row);
      return row;
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EMPLOYMENT,
      entityId: String(created.employment_id),
      action: 'create',
      metadata: { alumni_id: alumniId, is_current: isCurrent },
    });
    return created;
  }

  async update(
    actor: AlumniPlatformUser,
    alumniId: number,
    employmentId: number,
    dto: UpdateEmploymentDto,
  ) {
    this.assertCanManage(actor, alumniId);
    const existing = await this.lookup.employment(
      actor.institute_id,
      alumniId,
      employmentId,
    );
    const start = dto.start_date
      ? parseDateOnly(dto.start_date, 'start_date')
      : existing.start_date;
    const end =
      dto.end_date === undefined
        ? existing.end_date
        : dto.end_date === null
          ? null
          : parseDateOnly(dto.end_date, 'end_date');
    this.assertDates(start, end, existing.is_current);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.alumniEmployment.update({
        where: { employment_id: employmentId },
        data: {
          company: dto.company,
          designation: dto.designation,
          industry: dto.industry,
          location: dto.location,
          start_date: start,
          end_date: end,
        },
      });
      if (row.is_current) await this.syncProfile(tx, alumniId, row);
      return row;
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EMPLOYMENT,
      entityId: String(employmentId),
      action: 'update',
      metadata: { alumni_id: alumniId },
    });
    return updated;
  }

  /** Makes an existing position the current one (re-opening it if it had ended). */
  async setCurrent(
    actor: AlumniPlatformUser,
    alumniId: number,
    employmentId: number,
  ) {
    this.assertCanManage(actor, alumniId);
    const existing = await this.lookup.employment(
      actor.institute_id,
      alumniId,
      employmentId,
    );
    if (existing.is_current) return existing;
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.closeOtherCurrent(
        tx,
        alumniId,
        existing.start_date,
        employmentId,
      );
      const row = await tx.alumniEmployment.update({
        where: { employment_id: employmentId },
        data: { is_current: true, end_date: null },
      });
      await this.syncProfile(tx, alumniId, row);
      return row;
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EMPLOYMENT,
      entityId: String(employmentId),
      action: 'set_current',
      metadata: { alumni_id: alumniId },
    });
    return updated;
  }

  /** Soft delete: the entry leaves the timeline but stays in the database. */
  async remove(
    actor: AlumniPlatformUser,
    alumniId: number,
    employmentId: number,
  ) {
    this.assertCanManage(actor, alumniId);
    await this.lookup.employment(actor.institute_id, alumniId, employmentId);
    await this.prisma.alumniEmployment.update({
      where: { employment_id: employmentId },
      data: { is_active: false, is_current: false },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EMPLOYMENT,
      entityId: String(employmentId),
      action: 'delete',
      metadata: { alumni_id: alumniId },
    });
    return { employment_id: employmentId, deleted: true };
  }
}
