import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { LibNotificationService } from '../notifications/lib-notification.service';
import { PayFineDto } from './dto/pay-fine.dto';
import { WaiveFineDto } from './dto/waive-fine.dto';

/**
 * FineService (calc engine) — architecture-named service.
 * Exposes calculateFine as a pure method (no side effects) for use by
 * ReturnService and SchedulerService.
 */
@Injectable()
export class LibFinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: LibNotificationService,
  ) {}

  /**
   * Pure fine calculation — no DB writes.
   */
  calculateFine(
    overdueDays: number,
    finePerDay: number,
    maxFineCap: number | null,
  ): number {
    const raw = finePerDay * overdueDays;
    return maxFineCap !== null && raw > maxFineCap ? maxFineCap : raw;
  }

  /**
   * Create a fine record (called by ReturnService and SchedulerService).
   */
  async createFine(
    instituteId: string,
    issueId: number,
    memberId: number,
    reason: 'overdue' | 'lost_book' | 'damaged_book',
    amount: number,
  ) {
    const fine = await this.prisma.libFine.create({
      data: {
        institute_id: requireInstituteId(instituteId),
        issue_id: issueId,
        member_id: memberId,
        reason,
        amount,
        status: 'pending',
      },
    });
    await this.notificationService.sendFineAlert(memberId, fine.fine_id);
    return fine;
  }

  async findByMember(instituteId: string, memberId: number) {
    const institute_id = requireInstituteId(instituteId);
    const member = await this.prisma.libMember.findFirst({ where: { member_id: memberId, institute_id } });
    if (!member) throw new NotFoundException(`Member #${memberId} not found`);
    return this.prisma.libFine.findMany({
      where: { member_id: memberId, institute_id },
      include: { payments: true },
      orderBy: { calculated_at: 'desc' },
    });
  }

  async findOne(instituteId: string, fineId: number) {
    const fine = await this.prisma.libFine.findFirst({
      where: { fine_id: fineId, institute_id: requireInstituteId(instituteId) },
      include: { payments: true, member: true },
    });
    if (!fine) throw new NotFoundException(`Fine #${fineId} not found`);
    return fine;
  }

  async pay(instituteId: string, fineId: number, dto: PayFineDto) {
    const fine = await this.findOne(instituteId, fineId);
    if (fine.status === 'paid' || fine.status === 'waived') {
      throw new ConflictException(`Fine #${fineId} is already ${fine.status}`);
    }

    const totalPaid = fine.payments.reduce(
      (sum, p) => sum + Number(p.amount_paid),
      0,
    );
    const remaining = Number(fine.amount) - totalPaid;
    if (dto.amount_paid > remaining) {
      throw new ConflictException(`Amount exceeds remaining balance of ₹${remaining.toFixed(2)}`);
    }

    // Ensure system user exists in library_users
    const userExists = await this.prisma.libUser.findUnique({ where: { user_id: dto.received_by } });
    if (!userExists) {
      await this.prisma.libUser.create({
        data: { user_id: dto.received_by, name: 'System User', role: 'librarian' },
      });
    }

    const payment = await this.prisma.libFinePayment.create({
      data: {
        fine_id: fineId,
        amount_paid: dto.amount_paid,
        payment_date: new Date(),
        payment_mode: dto.payment_mode as any,
        received_by: dto.received_by,
        transaction_ref: dto.transaction_ref,
      },
    });

    // Determine new status
    const newTotalPaid = totalPaid + dto.amount_paid;
    const newStatus = newTotalPaid >= Number(fine.amount) ? 'paid' : 'partially_paid';
    await this.prisma.libFine.update({
      where: { fine_id: fineId },
      data: { status: newStatus },
    });

    return { payment, new_status: newStatus };
  }

  async waive(instituteId: string, fineId: number, _dto: WaiveFineDto) {
    const fine = await this.findOne(instituteId, fineId);
    if (fine.status === 'paid' || fine.status === 'waived') {
      throw new ConflictException(`Fine #${fineId} is already ${fine.status}`);
    }
    return this.prisma.libFine.update({
      where: { fine_id: fineId },
      data: { status: 'waived' },
    });
  }
}
