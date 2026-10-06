import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class LibCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(instituteId: string, dto: CreateCategoryDto) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.prisma.libCategory.findFirst({
      where: { institute_id, name: dto.name },
    });
    if (existing) throw new ConflictException('Category name already exists');
    return this.prisma.libCategory.create({ data: { ...dto, institute_id } });
  }

  async findAll(instituteId: string) {
    return this.prisma.libCategory.findMany({
      where: { institute_id: requireInstituteId(instituteId) },
      orderBy: { name: 'asc' },
    });
  }

  async update(instituteId: string, id: number, dto: UpdateCategoryDto) {
    await this.findOneOrFail(instituteId, id);
    return this.prisma.libCategory.update({
      where: { category_id: id },
      data: dto,
    });
  }

  async remove(instituteId: string, id: number) {
    await this.findOneOrFail(instituteId, id);
    const booksCount = await this.prisma.libBook.count({
      where: { category_id: id, institute_id: instituteId },
    });
    if (booksCount > 0) {
      throw new ConflictException(
        'Cannot delete category with existing books assigned to it',
      );
    }
    return this.prisma.libCategory.delete({ where: { category_id: id } });
  }

  async findOneOrFail(instituteId: string, id: number) {
    const cat = await this.prisma.libCategory.findFirst({
      where: { category_id: id, institute_id: requireInstituteId(instituteId) },
    });
    if (!cat) throw new NotFoundException(`Category #${id} not found`);
    return cat;
  }
}
