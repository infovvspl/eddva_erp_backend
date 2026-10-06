import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { LibNotificationService } from '../notifications/lib-notification.service';
import { ReturnIssueDto } from './dto/return-issue.dto';
import { diffDays } from '../../common/utils/date.util';

/**
 * ReturnService — architecture-named distinct service.
 * Handles book returns, fine computation, and reservation queue notification.
 */
@Injectable()
export class ReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: LibNotificationService,
  ) {}

  async returnBook(instituteId: string, issueId: number, dto: ReturnIssueDto) {
    const institute_id = requireInstituteId(instituteId);
    const issue = await this.prisma.libIssueRecord.findFirst({
      where: { issue_id: issueId, institute_id },
      include: { copy: { include: { book: true } } },
    });
    if (!issue) throw new NotFoundException(`Issue record #${issueId} not found`);
    if (!['issued', 'overdue'].includes(issue.status)) {
      throw new ConflictException(`Issue #${issueId} is already returned or lost`);
    }

    // Derive librarian user id (received_by or returned_to, fallback 1)
    const returnedToId = dto.received_by ?? dto.returned_to ?? 1;

    // Ensure system user exists in library_users
    const userExists = await this.prisma.libUser.findUnique({ where: { user_id: returnedToId } });
    if (!userExists) {
      await this.prisma.libUser.create({
        data: { user_id: returnedToId, name: 'System User', role: 'librarian' },
      });
    }

    const today = new Date();
    const dueDate = new Date(issue.due_date);

    // Calculate overdue days (respecting grace period)
    const rawOverdueDays = diffDays(today, dueDate);
    const overdueDays = Math.max(0, rawOverdueDays - issue.grace_period_days);

    // Prepare book copy update data
    const copyUpdateData: any = { status: 'available' };
    if (dto.returned_condition) {
      copyUpdateData.condition = dto.returned_condition;
    }

    // Use Prisma transaction: update issue + copy + create fine (if needed)
    const ops: any[] = [
      this.prisma.libIssueRecord.update({
        where: { issue_id: issueId },
        data: {
          return_date: today,
          status: 'returned',
          returned_to: returnedToId,
        },
      }),
      this.prisma.libBookCopy.update({
        where: { copy_id: issue.copy_id },
        data: copyUpdateData,
      }),
    ];

    let fineRecord: any = null;
    if (overdueDays > 0) {
      const finePerDay = Number(issue.fine_per_day);
      let amount = finePerDay * overdueDays;
      if (issue.max_fine_cap) {
        const cap = Number(issue.max_fine_cap);
        if (amount > cap) amount = cap;
      }

      fineRecord = { overdueDays, amount, member_id: issue.member_id, issue_id: issueId };
    }

    await this.prisma.$transaction(ops);

    // Create fine record after transaction
    let createdFine: any = null;
    if (fineRecord) {
      createdFine = await this.prisma.libFine.create({
        data: {
          institute_id,
          issue_id: fineRecord.issue_id,
          member_id: fineRecord.member_id,
          reason: 'overdue',
          amount: fineRecord.amount,
          status: 'pending',
        },
      });
      await this.notificationService.sendFineAlert(fineRecord.member_id, createdFine.fine_id);
    }

    // Notify next in reservation queue
    const nextReservation = await this.prisma.libReservation.findFirst({
      where: {
        institute_id,
        book_id: issue.copy.book_id,
        status: 'pending',
      },
      orderBy: { reserved_date: 'asc' },
    });

    if (nextReservation) {
      const expiryDays = parseInt(process.env.LIBRARY_RESERVATION_EXPIRY_DAYS ?? '3', 10);
      const expiry_date = new Date();
      expiry_date.setDate(expiry_date.getDate() + expiryDays);

      await this.prisma.libReservation.update({
        where: { reservation_id: nextReservation.reservation_id },
        data: { status: 'ready_for_pickup', expiry_date },
      });
      await this.notificationService.sendReservationReady(
        nextReservation.member_id,
        nextReservation.reservation_id,
      );
    }

    await this.notificationService.sendReturnConfirmation(issue.member_id, issueId);

    return { issue_id: issueId, returned: true, fine: createdFine };
  }
}
