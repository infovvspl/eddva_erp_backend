import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import {
  ALUMNI_CONTACT_SELECT,
  canViewProfile,
  summaryFor,
  viewerOf,
  visibleProfilesWhere,
} from '../common/alumni-profile.view';
import { BusinessException } from '../common/business-exception';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { PageQueryDto } from '../common/page-query.dto';
import { orConflict } from '../common/unique-violation.util';
import { isAlumniPrincipal } from '../common/alumni-access.service';
import {
  AddGroupMembersDto,
  CreateAlumniGroupDto,
  QueryAlumniGroupDto,
  UpdateAlumniGroupDto,
} from './dto/group.dto';

const DUPLICATE_GROUP = 'A group with this name and type already exists';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
  ) {}

  async create(actor: AlumniPlatformUser, dto: CreateAlumniGroupDto) {
    const group = await orConflict(DUPLICATE_GROUP, () =>
      this.prisma.alumniGroup.create({
        data: {
          institute_id: actor.institute_id,
          name: dto.name,
          group_type: dto.group_type,
          description: dto.description,
          created_by: actor.eddva_user_id,
        },
      }),
    );
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.GROUP,
      entityId: String(group.group_id),
      action: 'create',
    });
    return group;
  }

  async findAll(actor: AlumniPlatformUser, query: QueryAlumniGroupDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const includeInactive =
      !isAlumniPrincipal(actor) && query.include_inactive === true;
    const where: Prisma.AlumniGroupWhereInput = {
      institute_id: actor.institute_id,
      group_type: query.group_type,
      ...(includeInactive ? {} : { is_active: true }),
      ...(query.search
        ? { name: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniGroup.findMany({
        where,
        orderBy: [{ group_type: 'asc' }, { name: 'asc' }],
        skip,
        take,
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.alumniGroup.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const group = await this.lookup.group(actor.institute_id, id);
    if (!group.is_active && isAlumniPrincipal(actor)) {
      throw new NotFoundException(`Alumni group #${id} not found`);
    }
    const members = await this.prisma.alumniGroupMember.count({
      where: { group_id: id },
    });
    return { ...group, member_count: members };
  }

  async update(
    actor: AlumniPlatformUser,
    id: number,
    dto: UpdateAlumniGroupDto,
  ) {
    await this.lookup.group(actor.institute_id, id);
    const group = await orConflict(DUPLICATE_GROUP, () =>
      this.prisma.alumniGroup.update({
        where: { group_id: id },
        data: {
          name: dto.name,
          group_type: dto.group_type,
          description: dto.description,
          is_active: dto.is_active,
        },
      }),
    );
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.GROUP,
      entityId: String(id),
      action: 'update',
      metadata: { fields: Object.keys(dto) },
    });
    return group;
  }

  /** Soft delete — memberships are kept so the group can be reactivated. */
  async remove(actor: AlumniPlatformUser, id: number) {
    await this.lookup.group(actor.institute_id, id);
    const group = await this.prisma.alumniGroup.update({
      where: { group_id: id },
      data: { is_active: false },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.GROUP,
      entityId: String(id),
      action: 'deactivate',
    });
    return group;
  }

  // ─── Memberships ─────────────────────────────────────────────────────────

  /** Bulk add; someone already in the group is skipped rather than failing the batch. */
  async addMembers(
    actor: AlumniPlatformUser,
    groupId: number,
    dto: AddGroupMembersDto,
  ) {
    const group = await this.lookup.group(actor.institute_id, groupId);
    if (!group.is_active) {
      throw new BusinessException(
        'GROUP_INACTIVE',
        'Members cannot be added to a deactivated group',
      );
    }
    const found = await this.prisma.alumniProfile.findMany({
      where: {
        institute_id: actor.institute_id,
        alumni_id: { in: dto.alumni_ids },
        is_active: true,
      },
      select: { alumni_id: true },
    });
    const foundIds = new Set(found.map((f) => f.alumni_id));
    const missing = dto.alumni_ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BusinessException(
        'ALUMNI_NOT_FOUND',
        'Some alumni do not exist or are inactive',
        { alumni_ids: missing },
        404,
      );
    }
    // The unique (group_id, alumni_id) index is what actually prevents duplicates;
    // skipDuplicates turns a racing insert into a skip instead of an error.
    const { count } = await this.prisma.alumniGroupMember.createMany({
      data: dto.alumni_ids.map((alumni_id) => ({
        institute_id: actor.institute_id,
        group_id: groupId,
        alumni_id,
        added_by: actor.eddva_user_id,
      })),
      skipDuplicates: true,
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.GROUP_MEMBER,
      entityId: String(groupId),
      action: 'add_members',
      metadata: { requested: dto.alumni_ids.length, added: count },
    });
    return {
      group_id: groupId,
      added: count,
      skipped: dto.alumni_ids.length - count,
    };
  }

  async removeMember(
    actor: AlumniPlatformUser,
    groupId: number,
    alumniId: number,
  ) {
    await this.lookup.group(actor.institute_id, groupId);
    const { count } = await this.prisma.alumniGroupMember.deleteMany({
      where: {
        group_id: groupId,
        alumni_id: alumniId,
        institute_id: actor.institute_id,
      },
    });
    if (count === 0) {
      throw new NotFoundException(
        `Alumni #${alumniId} is not a member of group #${groupId}`,
      );
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.GROUP_MEMBER,
      entityId: String(groupId),
      action: 'remove_member',
      metadata: { alumni_id: alumniId },
    });
    return { group_id: groupId, alumni_id: alumniId, removed: true };
  }

  async listMembers(
    actor: AlumniPlatformUser,
    groupId: number,
    query: PageQueryDto,
  ) {
    const group = await this.lookup.group(actor.institute_id, groupId);
    const viewer = viewerOf(actor);
    if (!group.is_active && viewer.kind !== 'staff') {
      throw new NotFoundException(`Alumni group #${groupId} not found`);
    }
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniGroupMemberWhereInput = {
      group_id: groupId,
      // Peers only see members whose profile they may see anyway.
      alumni: {
        AND: [
          visibleProfilesWhere(viewer),
          ...(query.search
            ? [
                {
                  full_name: {
                    contains: query.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              ]
            : []),
        ],
      },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniGroupMember.findMany({
        where,
        orderBy: { alumni: { full_name: 'asc' } },
        skip,
        take,
        include: { alumni: { select: ALUMNI_CONTACT_SELECT } },
      }),
      this.prisma.alumniGroupMember.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        member_id: row.member_id,
        joined_at: row.joined_at,
        alumni: summaryFor(viewer, row.alumni),
      })),
      pagination: buildMeta(total, page, limit),
    };
  }

  /** The groups one alumnus belongs to. */
  async groupsOf(actor: AlumniPlatformUser, alumniId: number) {
    const profile = await this.lookup.profile(actor.institute_id, alumniId);
    if (!canViewProfile(viewerOf(actor), profile)) {
      throw new NotFoundException(`Alumni #${alumniId} not found`);
    }
    const rows = await this.prisma.alumniGroupMember.findMany({
      where: {
        alumni_id: alumniId,
        institute_id: actor.institute_id,
        group: { is_active: true },
      },
      include: { group: true },
      orderBy: { group: { name: 'asc' } },
    });
    return rows.map((r) => ({ ...r.group, joined_at: r.joined_at }));
  }
}
