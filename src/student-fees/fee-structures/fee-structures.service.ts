import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateFeeStructureDto, UpdateFeeStructureDto, QueryFeeStructureDto } from './dto/fee-structure.dto';

@Injectable()
export class FeeStructuresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(instituteId: string, dto: CreateFeeStructureDto) {
    const institute_id = requireInstituteId(instituteId);
    const cls = await this.prisma.feeClass.findFirst({ where: { class_id: dto.class_id, institute_id } });
    if (!cls) throw new NotFoundException(`Class #${dto.class_id} not found`);

    const clash = await this.prisma.feeStructure.findFirst({
      where: { institute_id, class_id: dto.class_id, term_name: dto.term_name, academic_year: dto.academic_year },
    });
    if (clash) throw new ConflictException(`"${dto.term_name}" already exists for this class in ${dto.academic_year}`);

    return this.prisma.feeStructure.create({
      data: {
        institute_id,
        class_id: dto.class_id,
        term_name: dto.term_name,
        amount: dto.amount,
        due_date: new Date(dto.due_date),
        academic_year: dto.academic_year,
      },
    });
  }

  async findAll(instituteId: string, query: QueryFeeStructureDto) {
    return this.prisma.feeStructure.findMany({
      where: { institute_id: requireInstituteId(instituteId), class_id: query.class_id, academic_year: query.academic_year },
      include: { class: true },
      orderBy: [{ class_id: 'asc' }, { due_date: 'asc' }],
    });
  }

  async findOne(instituteId: string, id: number) {
    const row = await this.prisma.feeStructure.findFirst({
      where: { structure_id: id, institute_id: requireInstituteId(instituteId) },
      include: { class: true },
    });
    if (!row) throw new NotFoundException(`Fee structure #${id} not found`);
    return row;
  }

  async update(instituteId: string, id: number, dto: UpdateFeeStructureDto) {
    await this.findOne(instituteId, id);
    return this.prisma.feeStructure.update({
      where: { structure_id: id },
      data: {
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.due_date !== undefined && { due_date: new Date(dto.due_date) }),
      },
    });
  }
}
