import { Injectable } from '@nestjs/common';
import { AlumniDynamicRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALUMNI_SELF_SERVICE_RULES,
  ALUMNI_SYSTEM_ROLE_NAME,
} from '../roles-permissions/alumni-permission-catalog';
import { isUniqueViolation } from './unique-violation.util';

/**
 * The self-service "Alumni" role is created lazily per institute the first time
 * an alumnus registers or staff issue a portal account. If an Institute Admin
 * has edited its permissions, the edited role is used as-is — this only ever
 * creates a missing role, it never overwrites one.
 */
@Injectable()
export class AlumniSystemRoleService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(
    instituteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AlumniDynamicRole> {
    const db = tx ?? this.prisma;
    const key = {
      institute_id_name: {
        institute_id: instituteId,
        name: ALUMNI_SYSTEM_ROLE_NAME,
      },
    };
    const existing = await db.alumniDynamicRole.findUnique({ where: key });
    if (existing) return existing;
    try {
      // A savepoint-free create inside a caller's transaction would poison it on
      // a unique race, so the race is resolved by upserting instead of catching.
      return await db.alumniDynamicRole.upsert({
        where: key,
        update: {},
        create: {
          institute_id: instituteId,
          name: ALUMNI_SYSTEM_ROLE_NAME,
          description:
            'Self-service alumni portal access (own profile, events, jobs, mentorship, donations)',
          permissions: ALUMNI_SELF_SERVICE_RULES.map((rule) => ({
            resource: rule.resource,
            actions: [...rule.actions],
          })),
          is_system: true,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return db.alumniDynamicRole.findUniqueOrThrow({ where: key });
    }
  }
}
