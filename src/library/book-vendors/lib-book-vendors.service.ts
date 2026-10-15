import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateBookVendorDto } from './dto/create-book-vendor.dto';
import { UpdateBookVendorDto } from './dto/update-book-vendor.dto';

@Injectable()
export class LibBookVendorsService {
  constructor(private readonly prisma: PrismaService) {}

  private async findBookOrFail(instituteId: string, bookId: number) {
    const book = await this.prisma.libBook.findFirst({
      where: { book_id: bookId, institute_id: requireInstituteId(instituteId) },
    });
    if (!book) throw new NotFoundException(`Book #${bookId} not found`);
    return book;
  }

  // A vendor belongs to a book, so it is scoped through the book's institute.
  private async findVendorOrFail(instituteId: string, vendorId: number) {
    const vendor = await this.prisma.libBookVendor.findFirst({
      where: { book_vendor_id: vendorId, book: { institute_id: requireInstituteId(instituteId) } },
    });
    if (!vendor) throw new NotFoundException(`Vendor #${vendorId} not found`);
    return vendor;
  }

  async create(instituteId: string, bookId: number, dto: CreateBookVendorDto) {
    const instId = requireInstituteId(instituteId);
    await this.findBookOrFail(instId, bookId);

    if (dto.vendor_id) {
      // Picked from the master list — reuse its details, no retyping.
      const vendor = await this.prisma.libVendor.findFirst({
        where: { vendor_id: dto.vendor_id, institute_id: instId },
      });
      if (!vendor) throw new NotFoundException(`Vendor #${dto.vendor_id} not found`);
      return this.prisma.libBookVendor.create({
        data: {
          book_id: bookId,
          vendor_id: vendor.vendor_id,
          vendor_name: vendor.vendor_name,
          name: vendor.vendor_name,
          contact_person: vendor.contact_person,
          phone: vendor.phone,
          email: vendor.email,
          address: vendor.address,
          last_purchase_price: dto.last_purchase_price,
        },
      });
    }

    const vendorName = dto.vendor_name ?? dto.name ?? 'Unknown Vendor';
    // New vendor details — save them to the master list too (upsert by name)
    // so the next book purchased from this vendor can just pick it.
    const vendor = await this.prisma.libVendor.upsert({
      where: { institute_id_vendor_name: { institute_id: instId, vendor_name: vendorName } },
      update: {
        contact_person: dto.contact_person,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
      },
      create: {
        institute_id: instId,
        vendor_name: vendorName,
        contact_person: dto.contact_person,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
      },
    });

    return this.prisma.libBookVendor.create({
      data: {
        book_id: bookId,
        vendor_id: vendor.vendor_id,
        vendor_name: vendorName,
        name: dto.name ?? vendorName,
        contact_person: dto.contact_person,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        last_purchase_price: dto.last_purchase_price,
      },
    });
  }

  async findByBook(instituteId: string, bookId: number) {
    await this.findBookOrFail(instituteId, bookId);
    return this.prisma.libBookVendor.findMany({
      where: { book_id: bookId },
      orderBy: { vendor_name: 'asc' },
    });
  }

  /** The institute's reusable vendor master list, for a book-vendor picker. */
  async findAllVendors(instituteId: string) {
    return this.prisma.libVendor.findMany({
      where: { institute_id: requireInstituteId(instituteId) },
      orderBy: { vendor_name: 'asc' },
    });
  }

  async update(instituteId: string, vendorId: number, dto: UpdateBookVendorDto) {
    await this.findVendorOrFail(instituteId, vendorId);

    const data: any = {};
    if (dto.vendor_name || dto.name) data.vendor_name = dto.vendor_name ?? dto.name;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.contact_person !== undefined) data.contact_person = dto.contact_person;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.last_purchase_price !== undefined) data.last_purchase_price = dto.last_purchase_price;

    return this.prisma.libBookVendor.update({
      where: { book_vendor_id: vendorId },
      data,
    });
  }

  async remove(instituteId: string, vendorId: number) {
    await this.findVendorOrFail(instituteId, vendorId);

    await this.prisma.libBookVendor.delete({
      where: { book_vendor_id: vendorId },
    });
  }
}
