import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateFeeClassDto, UpdateFeeClassDto, QueryFeeClassDto } from './dto/class.dto';

@Injectable()
export class FeeClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(instituteId: string, dto: CreateFeeClassDto) {
    const institute_id = requireInstituteId(instituteId);
    const clash = await this.prisma.feeClass.findFirst({
      where: { institute_id, name: dto.name, academic_year: dto.academic_year },
    });
    if (clash) throw new ConflictException(`Class "${dto.name}" already exists for ${dto.academic_year}`);

    return this.prisma.feeClass.create({
      data: { institute_id, name: dto.name, academic_year: dto.academic_year },
    });
  }

  async findAll(instituteId: string, query: QueryFeeClassDto) {
    return this.prisma.feeClass.findMany({
      where: { institute_id: requireInstituteId(instituteId), academic_year: query.academic_year },
      include: { _count: { select: { students: true, fee_structures: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const row = await this.prisma.feeClass.findFirst({
      where: { class_id: id, institute_id: requireInstituteId(instituteId) },
      include: { _count: { select: { students: true, fee_structures: true } } },
    });
    if (!row) throw new NotFoundException(`Class #${id} not found`);
    return row;
  }

  async update(instituteId: string, id: number, dto: UpdateFeeClassDto) {
    await this.findOne(instituteId, id);
    return this.prisma.feeClass.update({ where: { class_id: id }, data: { name: dto.name } });
  }

  async remove(instituteId: string, id: number) {
    const existing = await this.findOne(instituteId, id);
    const counts = existing as unknown as { _count: { students: number; fee_structures: number } };
    if (counts._count.students > 0 || counts._count.fee_structures > 0) {
      throw new ConflictException('Cannot delete a class that has students or fee structures — remove those first');
    }
    await this.prisma.feeClass.delete({ where: { class_id: id } });
  }
}
