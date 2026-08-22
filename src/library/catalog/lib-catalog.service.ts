import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';

@Injectable()
export class LibCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBookDto) {
    if (dto.isbn) {
      const existing = await this.prisma.libBook.findUnique({
        where: { isbn: dto.isbn },
      });
      if (existing) throw new ConflictException(`Book with ISBN '${dto.isbn}' already exists`);
    }
    return this.prisma.libBook.create({ data: dto as any });
  }

  async findAll(query: BookQueryDto) {
    const { page = 1, limit = 20, q, category_id, language } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
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

  async search(q: string) {
    return this.prisma.libBook.findMany({
      where: {
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

  async findOne(id: number) {
    const book = await this.prisma.libBook.findUnique({
      where: { book_id: id },
      include: {
        category: true,
        _count: { select: { copies: { where: { status: 'available' } } } },
      },
    });
    if (!book) throw new NotFoundException(`Book #${id} not found`);
    return book;
  }

  async update(id: number, dto: UpdateBookDto) {
    await this.findOne(id);
    return this.prisma.libBook.update({
      where: { book_id: id },
      data: dto as any,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    const activeCopies = await this.prisma.libBookCopy.count({
      where: {
        book_id: id,
        status: { in: ['issued', 'reserved'] },
      },
    });
    if (activeCopies > 0) {
      throw new ConflictException('Cannot delete book with active issued/reserved copies');
    }
    return this.prisma.libBook.delete({ where: { book_id: id } });
  }

  async updateCoverImage(id: number, coverImageUrl: string) {
    await this.findOne(id);
    return this.prisma.libBook.update({
      where: { book_id: id },
      data: { cover_image_url: coverImageUrl },
    });
  }

  async findOneOrFail(id: number) {
    return this.findOne(id);
  }
}
