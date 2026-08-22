import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LibNotificationService } from '../notifications/lib-notification.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

const EXPIRY_DAYS = parseInt(process.env.LIBRARY_RESERVATION_EXPIRY_DAYS ?? '3', 10);

@Injectable()
export class LibReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: LibNotificationService,
  ) {}

  async create(dto: CreateReservationDto & { book_id: number }) {
    const { book_id, member_id } = dto;

    const book = await this.prisma.libBook.findUnique({ where: { book_id } });
    if (!book) throw new NotFoundException(`Book #${book_id} not found`);

    const member = await this.prisma.libMember.findUnique({ where: { member_id } });
    if (!member) throw new NotFoundException(`Member #${member_id} not found`);

    // Check: member doesn't already have this title on loan
    const alreadyIssued = await this.prisma.libIssueRecord.findFirst({
      where: {
        member_id,
        status: { in: ['issued', 'overdue'] },
        copy: { book_id },
      },
    });
    if (alreadyIssued) {
      throw new ConflictException('Member already has a copy of this title on loan');
    }

    // Check: no duplicate pending reservation
    const existing = await this.prisma.libReservation.findFirst({
      where: { book_id, member_id, status: 'pending' },
    });
    if (existing) {
      throw new ConflictException('Member already has a pending reservation for this title');
    }

    const today = new Date();
    const expiry_date = new Date(today);
    expiry_date.setDate(expiry_date.getDate() + EXPIRY_DAYS);

    return this.prisma.libReservation.create({
      data: {
        book_id,
        member_id,
        reserved_date: today,
        expiry_date,
        status: 'pending',
      },
    });
  }

  async cancel(reservationId: number) {
    const reservation = await this.prisma.libReservation.findUnique({
      where: { reservation_id: reservationId },
    });
    if (!reservation) throw new NotFoundException(`Reservation #${reservationId} not found`);
    if (['cancelled', 'fulfilled', 'expired'].includes(reservation.status)) {
      throw new ConflictException(`Reservation is already ${reservation.status}`);
    }
    return this.prisma.libReservation.update({
      where: { reservation_id: reservationId },
      data: { status: 'cancelled' },
    });
  }

  async findAll(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.libReservation.findMany({
      where,
      include: {
        book: { select: { title: true, author: true } },
        member: { select: { name: true, library_card_number: true } },
      },
      orderBy: { reserved_date: 'asc' },
    });
  }

  async notifyNextInQueue(bookId: number) {
    const next = await this.prisma.libReservation.findFirst({
      where: { book_id: bookId, status: 'pending' },
      orderBy: { reserved_date: 'asc' },
    });
    if (!next) return;

    const expiry_date = new Date();
    expiry_date.setDate(expiry_date.getDate() + EXPIRY_DAYS);

    await this.prisma.libReservation.update({
      where: { reservation_id: next.reservation_id },
      data: { status: 'ready_for_pickup', expiry_date },
    });
    await this.notificationService.sendReservationReady(next.member_id, next.reservation_id);
  }
}
