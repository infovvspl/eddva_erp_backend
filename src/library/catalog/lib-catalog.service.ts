import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';

@Injectable()
export class LibCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** A book may only use a category that belongs to the same institute. */
  private async assertCategoryInInstitute(instituteId: string, categoryId: number) {
    const category = await this.prisma.libCategory.findFirst({
      where: { category_id: categoryId, institute_id: instituteId },
    });
    if (!category) throw new BadRequestException(`Category #${categoryId} not found`);
  }

  async create(instituteId: string, dto: CreateBookDto) {
    const institute_id = requireInstituteId(instituteId);
    if (dto.isbn) {
      const existing = await this.prisma.libBook.findFirst({
        where: { institute_id, isbn: dto.isbn },
      });
      if (existing) throw new ConflictException(`Book with ISBN '${dto.isbn}' already exists`);
    }
    await this.assertCategoryInInstitute(institute_id, dto.category_id);
    return this.prisma.libBook.create({ data: { ...(dto as any), institute_id } });
  }

  async findAll(instituteId: string, query: BookQueryDto) {
    const institute_id = requireInstituteId(instituteId);
    const { page = 1, limit = 20, q, category_id, language } = query;
    const skip = (page - 1) * limit;

    const where: any = { institute_id };
    if (category_id) where.category_id = category_id;
    if (language) where.language = { equals: language, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { author: { contains: q, mode: 'insensitive' } },
        { isbn: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.libBook.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
          _count: { select: { copies: { where: { status: 'available' } } } },
        },
        orderBy: { title: 'asc' },
      }),
      this.prisma.libBook.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async search(instituteId: string, q: string) {
    return this.prisma.libBook.findMany({
      where: {
        institute_id: requireInstituteId(instituteId),
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { author: { contains: q, mode: 'insensitive' } },
          { isbn: { contains: q, mode: 'insensitive' } },
          { publisher: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        category: true,
        _count: { select: { copies: { where: { status: 'available' } } } },
      },
      take: 50,
      orderBy: { title: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const book = await this.prisma.libBook.findFirst({
      where: { book_id: id, institute_id: requireInstituteId(instituteId) },
      include: {
        category: true,
        _count: { select: { copies: { where: { status: 'available' } } } },
      },
    });
    if (!book) throw new NotFoundException(`Book #${id} not found`);
    return book;
  }

  async update(instituteId: string, id: number, dto: UpdateBookDto) {
    await this.findOne(instituteId, id);
    if (dto.category_id !== undefined) {
      await this.assertCategoryInInstitute(instituteId, dto.category_id);
    }
    return this.prisma.libBook.update({
      where: { book_id: id },
      data: dto as any,
    });
  }

  async remove(instituteId: string, id: number) {
    await this.findOne(instituteId, id);
    const activeCopies = await this.prisma.libBookCopy.count({
      where: {
        book_id: id,
        institute_id: instituteId,
        status: { in: ['issued', 'reserved'] },
      },
    });
    if (activeCopies > 0) {
      throw new ConflictException('Cannot delete book with active issued/reserved copies');
    }
    return this.prisma.libBook.delete({ where: { book_id: id } });
  }

  async updateCoverImage(instituteId: string, id: number, coverImageUrl: string) {
    await this.findOne(instituteId, id);
    return this.prisma.libBook.update({
      where: { book_id: id },
      data: { cover_image_url: coverImageUrl },
    });
  }

  async findOneOrFail(instituteId: string, id: number) {
    return this.findOne(instituteId, id);
  }
}
