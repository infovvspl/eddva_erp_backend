import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateCopyDto } from './dto/create-copy.dto';
import { UpdateCopyDto } from './dto/update-copy.dto';

@Injectable()
export class LibCopiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(instituteId: string, bookId: number, dto: CreateCopyDto) {
    const institute_id = requireInstituteId(instituteId);

    // Verify the book exists in this institute
    const book = await this.prisma.libBook.findFirst({ where: { book_id: bookId, institute_id } });
    if (!book) throw new NotFoundException(`Book #${bookId} not found`);

    // Barcodes are unique per institute
    const barcodeExists = await this.prisma.libBookCopy.findFirst({
      where: { institute_id, barcode: dto.barcode },
    });
    if (barcodeExists) throw new ConflictException(`Barcode '${dto.barcode}' already in use`);

    // Accession numbers run per institute
    const year = new Date().getFullYear();
    const count = await this.prisma.libBookCopy.count({ where: { institute_id } });
    const accession_number = `ACC-${year}-${String(count + 1).padStart(6, '0')}`;

    return this.prisma.libBookCopy.create({
      data: {
        ...dto,
        institute_id,
        book_id: bookId,
        accession_number,
        condition: (dto.condition as any) ?? 'new',
        acquired_date: dto.acquired_date ? new Date(dto.acquired_date) : undefined,
      },
    });
  }

  async findByBook(instituteId: string, bookId: number) {
    const institute_id = requireInstituteId(instituteId);
    const book = await this.prisma.libBook.findFirst({ where: { book_id: bookId, institute_id } });
    if (!book) throw new NotFoundException(`Book #${bookId} not found`);

    return this.prisma.libBookCopy.findMany({
      where: { book_id: bookId, institute_id },
      orderBy: { accession_number: 'asc' },
    });
  }

  async update(instituteId: string, copyId: number, dto: UpdateCopyDto) {
    await this.findOneOrFail(instituteId, copyId);

    return this.prisma.libBookCopy.update({
      where: { copy_id: copyId },
      data: dto as any,
    });
  }

  async findOneOrFail(instituteId: string, copyId: number) {
    const copy = await this.prisma.libBookCopy.findFirst({
      where: { copy_id: copyId, institute_id: requireInstituteId(instituteId) },
    });
    if (!copy) throw new NotFoundException(`Copy #${copyId} not found`);
    return copy;
  }
}
