import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';

/**
 * All metrics are computed via COUNT/GROUP BY aggregate queries — never by
 * loading full record sets into application memory.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(instituteId: string) {
    const institute_id = requireInstituteId(instituteId);

    const [total, active, byType, byStatus, byDepartmentRaw] = await Promise.all([
      this.prisma.staffMember.count({ where: { institute_id } }),
      this.prisma.staffMember.count({ where: { institute_id, status: 'active' } }),
      this.prisma.staffMember.groupBy({
        by: ['staff_type'],
        where: { institute_id, status: 'active' },
        _count: { _all: true },
      }),
      this.prisma.staffMember.groupBy({
        by: ['status'],
        where: { institute_id },
        _count: { _all: true },
      }),
      this.prisma.staffMember.groupBy({
        by: ['department_id'],
        where: { institute_id, status: 'active' },
        _count: { _all: true },
      }),
    ]);

    const departments = await this.prisma.staffDepartment.findMany({
      where: { department_id: { in: byDepartmentRaw.map((r) => r.department_id) }, institute_id },
    });
    const deptMap = new Map(departments.map((d) => [d.department_id, d.name]));

    return {
      total_staff: total,
      active_staff: active,
      by_type: byType.map((r) => ({ staff_type: r.staff_type, count: r._count._all })),
      by_status: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
      by_department: byDepartmentRaw.map((r) => ({
        department_id: r.department_id,
        department: deptMap.get(r.department_id) ?? 'Unknown',
        count: r._count._all,
      })),
    };
  }
}
