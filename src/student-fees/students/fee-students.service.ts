import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { parsePagination, buildMeta } from '../common/pagination.util';
import { CreateFeeStudentDto, UpdateFeeStudentDto, QueryFeeStudentDto } from './dto/student.dto';

@Injectable()
export class FeeStudentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertClassExists(instituteId: string, classId: number) {
    const cls = await this.prisma.feeClass.findFirst({ where: { class_id: classId, institute_id: instituteId } });
    if (!cls) throw new NotFoundException(`Class #${classId} not found`);
    return cls;
  }

  async create(instituteId: string, dto: CreateFeeStudentDto) {
    const institute_id = requireInstituteId(instituteId);
    await this.assertClassExists(institute_id, dto.class_id);

    return this.prisma.feeStudent.create({
      data: {
        institute_id,
        class_id: dto.class_id,
        name: dto.name,
        roll_no: dto.roll_no,
        guardian_name: dto.guardian_name,
        guardian_contact: dto.guardian_contact,
      },
    });
  }

  async findAll(instituteId: string, query: QueryFeeStudentDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const institute_id = requireInstituteId(instituteId);
    const where = {
      institute_id,
      class_id: query.class_id,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { roll_no: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.feeStudent.findMany({
        where,
        include: { class: true },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.feeStudent.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const row = await this.prisma.feeStudent.findFirst({
      where: { student_id: id, institute_id: requireInstituteId(instituteId) },
      include: { class: true },
    });
    if (!row) throw new NotFoundException(`Student #${id} not found`);
    return row;
  }

  async update(instituteId: string, id: number, dto: UpdateFeeStudentDto) {
    const institute_id = requireInstituteId(instituteId);
    await this.findOne(institute_id, id);
    if (dto.class_id) await this.assertClassExists(institute_id, dto.class_id);

    return this.prisma.feeStudent.update({
      where: { student_id: id },
      data: {
        ...(dto.class_id !== undefined && { class_id: dto.class_id }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.roll_no !== undefined && { roll_no: dto.roll_no }),
        ...(dto.guardian_name !== undefined && { guardian_name: dto.guardian_name }),
        ...(dto.guardian_contact !== undefined && { guardian_contact: dto.guardian_contact }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }
}
