import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class LibCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.libCategory.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Category name already exists');
    return this.prisma.libCategory.create({ data: dto });
  }

  async findAll() {
    return this.prisma.libCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOneOrFail(id);
    return this.prisma.libCategory.update({
      where: { category_id: id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOneOrFail(id);
    const booksCount = await this.prisma.libBook.count({
      where: { category_id: id },
    });
    if (booksCount > 0) {
      throw new ConflictException(
        'Cannot delete category with existing books assigned to it',
      );
    }
    return this.prisma.libCategory.delete({ where: { category_id: id } });
  }

  private async findOneOrFail(id: number) {
    const cat = await this.prisma.libCategory.findUnique({
      where: { category_id: id },
    });
    if (!cat) throw new NotFoundException(`Category #${id} not found`);
    return cat;
  }
}
