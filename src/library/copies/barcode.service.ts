import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ScanResult {
  copy_id: number;
  barcode: string;
  accession_number: string;
  status: string;
  condition: string;
  rack_location: string | null;
  book: {
    book_id: number;
    title: string;
    author: string;
    isbn: string | null;
  };
  current_issue_id: number | null;
}

/**
 * BarcodeService — architecture-named dedicated service.
 * Resolves a barcode scan to full copy context.
 * A scan simply resolves barcode → copy_id, then the frontend
 * drives issue/return via the IssuesController.
 */
@Injectable()
export class BarcodeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(barcode: string): Promise<ScanResult> {
    const copy = await this.prisma.libBookCopy.findUnique({
      where: { barcode },
      include: {
        book: {
          select: {
            book_id: true,
            title: true,
            author: true,
            isbn: true,
          },
        },
        issue_records: {
          where: { status: { in: ['issued', 'overdue'] } },
          select: { issue_id: true },
          take: 1,
        },
      },
    });

    if (!copy) {
      throw new NotFoundException(`No copy found with barcode '${barcode}'`);
    }

    return {
      copy_id: copy.copy_id,
      barcode: copy.barcode,
      accession_number: copy.accession_number,
      status: copy.status,
      condition: copy.condition,
      rack_location: copy.rack_location,
      book: copy.book,
      current_issue_id: copy.issue_records[0]?.issue_id ?? null,
    };
  }
}
