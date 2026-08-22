import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBookVendorDto } from './dto/create-book-vendor.dto';
import { UpdateBookVendorDto } from './dto/update-book-vendor.dto';

@Injectable()
export class LibBookVendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(bookId: number, dto: CreateBookVendorDto) {
    const book = await this.prisma.libBook.findUnique({ where: { book_id: bookId } });
    if (!book) throw new NotFoundException(`Book #${bookId} not found`);

    const vendorName = dto.vendor_name ?? dto.name ?? 'Unknown Vendor';
    return this.prisma.libBookVendor.create({
      data: {
        book_id: bookId,
        vendor_name: vendorName,
        last_purchase_price: dto.last_purchase_price,
      },
    });
  }

  async findByBook(bookId: number) {
    const book = await this.prisma.libBook.findUnique({ where: { book_id: bookId } });
    if (!book) throw new NotFoundException(`Book #${bookId} not found`);
    return this.prisma.libBookVendor.findMany({
      where: { book_id: bookId },
      orderBy: { vendor_name: 'asc' },
    });
  }

  async update(vendorId: number, dto: UpdateBookVendorDto) {
    const vendor = await this.prisma.libBookVendor.findUnique({ where: { book_vendor_id: vendorId } });
    if (!vendor) throw new NotFoundException(`Vendor #${vendorId} not found`);

    const data: any = {};
    if (dto.vendor_name || dto.name) data.vendor_name = dto.vendor_name ?? dto.name;
    if (dto.last_purchase_price !== undefined) data.last_purchase_price = dto.last_purchase_price;

    return this.prisma.libBookVendor.update({
      where: { book_vendor_id: vendorId },
      data,
    });
  }
}
