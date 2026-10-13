import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';

@Injectable()
export class FeeReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Per class, for one academic year: how much is required (per-student fee x active students), how much has been collected, and the balance. */
  async classWise(instituteId: string, academicYear: string) {
    const institute_id = requireInstituteId(instituteId);

    const classes = await this.prisma.feeClass.findMany({
      where: { institute_id, academic_year: academicYear },
      include: {
        _count: { select: { students: { where: { status: 'active' } } } },
        fee_structures: true,
      },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      classes.map(async (cls) => {
        const perStudentRequired = cls.fee_structures.reduce((sum, s) => sum + Number(s.amount), 0);
        const activeStudents = cls._count.students;
        const required = perStudentRequired * activeStudents;

        const collectedAgg = await this.prisma.feePayment.aggregate({
          where: { institute_id, structure: { class_id: cls.class_id, academic_year: academicYear } },
          _sum: { amount_paid: true },
        });
        const collected = Number(collectedAgg._sum.amount_paid ?? 0);

        return {
          class_id: cls.class_id,
          class_name: cls.name,
          academic_year: cls.academic_year,
          student_count: activeStudents,
          term_count: cls.fee_structures.length,
          required,
          collected,
          balance: Math.max(0, required - collected),
          collection_percent: required > 0 ? Math.round((collected / required) * 1000) / 10 : 0,
        };
      }),
    );

    const totals = rows.reduce(
      (acc, r) => ({
        student_count: acc.student_count + r.student_count,
        required: acc.required + r.required,
        collected: acc.collected + r.collected,
        balance: acc.balance + r.balance,
      }),
      { student_count: 0, required: 0, collected: 0, balance: 0 },
    );

    return { academic_year: academicYear, classes: rows, totals };
  }
}
