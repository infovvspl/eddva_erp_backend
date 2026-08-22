import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCopyDto } from './dto/create-copy.dto';
import { UpdateCopyDto } from './dto/update-copy.dto';

@Injectable()
export class LibCopiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(bookId: number, dto: CreateCopyDto) {
    // Verify book exists
    const book = await this.prisma.libBook.findUnique({ where: { book_id: bookId } });
    if (!book) throw new NotFoundException(`Book #${bookId} not found`);

    // Check barcode uniqueness
    const barcodeExists = await this.prisma.libBookCopy.findUnique({
      where: { barcode: dto.barcode },
    });
    if (barcodeExists) throw new ConflictException(`Barcode '${dto.barcode}' already in use`);

    // Generate accession number
    const year = new Date().getFullYear();
    const count = await this.prisma.libBookCopy.count();
    const accession_number = `ACC-${year}-${String(count + 1).padStart(6, '0')}`;

    return this.prisma.libBookCopy.create({
      data: {
        ...dto,
        book_id: bookId,
        accession_number,
        condition: (dto.condition as any) ?? 'new',
        acquired_date: dto.acquired_date ? new Date(dto.acquired_date) : undefined,
      },
    });
  }

  async findByBook(bookId: number) {
    const book = await this.prisma.libBook.findUnique({ where: { book_id: bookId } });
    if (!book) throw new NotFoundException(`Book #${bookId} not found`);

    return this.prisma.libBookCopy.findMany({
      where: { book_id: bookId },
      orderBy: { accession_number: 'asc' },
    });
  }

  async update(copyId: number, dto: UpdateCopyDto) {
    const copy = await this.prisma.libBookCopy.findUnique({ where: { copy_id: copyId } });
    if (!copy) throw new NotFoundException(`Copy #${copyId} not found`);

    return this.prisma.libBookCopy.update({
      where: { copy_id: copyId },
      data: dto as any,
    });
  }

  async findOneOrFail(copyId: number) {
    const copy = await this.prisma.libBookCopy.findUnique({ where: { copy_id: copyId } });
    if (!copy) throw new NotFoundException(`Copy #${copyId} not found`);
    return copy;
  }
}
