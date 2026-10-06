import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { LibMembershipRulesService } from '../membership-rules/lib-membership-rules.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { RenewIssueDto } from './dto/renew-issue.dto';
import { addDays } from '../../common/utils/date.util';

const MAX_RENEWALS = parseInt(process.env.LIBRARY_MAX_RENEWALS ?? '2', 10);
const FINE_BLOCK_THRESHOLD = parseFloat(process.env.LIBRARY_FINE_BLOCK_THRESHOLD ?? '100');

/**
 * IssueService — architecture-named distinct service.
 * Handles new book issues and loan renewals. Every lookup is scoped to the
 * caller's institute, so a copy, member or issue from another school is
 * reported as not found.
 */
@Injectable()
export class IssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rulesService: LibMembershipRulesService,
  ) {}

  async issueBook(instituteId: string, dto: CreateIssueDto) {
    const institute_id = requireInstituteId(instituteId);
    const { copy_id, member_id, issued_by } = dto;

    // 1. Verify copy is available
    const copy = await this.prisma.libBookCopy.findFirst({ where: { copy_id, institute_id } });
    if (!copy) throw new NotFoundException(`Copy #${copy_id} not found. Please add a copy via POST /api/v1/library/books/:id/copies first.`);
    if (copy.status !== 'available') {
      throw new ConflictException(`Copy #${copy_id} is not available (status: ${copy.status})`);
    }

    // 2. Ensure system user exists in library_users
    const userExists = await this.prisma.libUser.findUnique({ where: { user_id: issued_by } });
    if (!userExists) {
      await this.prisma.libUser.create({
        data: { user_id: issued_by, name: 'System User', role: 'librarian' },
      });
    }

    // 2. Verify member is active
    const member = await this.prisma.libMember.findFirst({ where: { member_id, institute_id } });
    if (!member) throw new NotFoundException(`Member #${member_id} not found`);
    if (member.status !== 'active') {
      throw new ForbiddenException(`Member #${member_id} is not active (status: ${member.status})`);
    }

    // 3. Check unpaid fine threshold
    const pendingFinesSum = await this.prisma.libFine.aggregate({
      where: {
        member_id,
        institute_id,
        status: { in: ['pending', 'partially_paid'] },
      },
      _sum: { amount: true },
    });
    const totalUnpaid = Number(pendingFinesSum._sum.amount ?? 0);
    if (totalUnpaid >= FINE_BLOCK_THRESHOLD) {
      throw new UnprocessableEntityException(
        `Member has unpaid fines of ₹${totalUnpaid}. Clear fines before issuing books.`,
      );
    }

    // 4. Check borrow limit
    const rule = await this.rulesService.findByMemberType(institute_id, member.member_type);
    const activeCount = await this.prisma.libIssueRecord.count({
      where: { member_id, institute_id, status: { in: ['issued', 'overdue'] } },
    });
    if (activeCount >= rule.max_books_allowed) {
      throw new UnprocessableEntityException(
        `Member has reached the borrow limit of ${rule.max_books_allowed} book(s)`,
      );
    }

    // 5. Compute due_date and snapshot rule values
    const today = new Date();
    const due_date = addDays(today, rule.loan_period_days);

    // 6. Check if member has a reservation for this title and fulfill it
    const reservationToFulfill = await this.prisma.libReservation.findFirst({
      where: {
        institute_id,
        member_id,
        book_id: copy.book_id,
        status: { in: ['pending', 'ready_for_pickup'] },
      },
    });

    // 7. Create issue record + update copy status + fulfill reservation (transaction)
    const ops: any[] = [
      this.prisma.libIssueRecord.create({
        data: {
          institute_id,
          copy_id,
          member_id,
          issued_by,
          issue_date: today,
          due_date,
          fine_per_day: rule.fine_per_day,
          grace_period_days: rule.grace_period_days,
          max_fine_cap: rule.max_fine_cap,
        },
      }),
      this.prisma.libBookCopy.update({
        where: { copy_id },
        data: { status: 'issued' },
      }),
    ];

    if (reservationToFulfill) {
      ops.push(
        this.prisma.libReservation.update({
          where: { reservation_id: reservationToFulfill.reservation_id },
          data: { status: 'fulfilled' },
        }),
      );
    }

    const [issueRecord] = await this.prisma.$transaction(ops);

    return issueRecord;
  }

  async renewIssue(instituteId: string, issueId: number, dto: RenewIssueDto) {
    const institute_id = requireInstituteId(instituteId);
    const issue = await this.prisma.libIssueRecord.findFirst({
      where: { issue_id: issueId, institute_id },
      include: { copy: { include: { book: true } }, member: true },
    });
    if (!issue) throw new NotFoundException(`Issue record #${issueId} not found`);
    if (!['issued', 'overdue'].includes(issue.status)) {
      throw new ConflictException('Can only renew an active (issued/overdue) record');
    }
    if (issue.renewal_count >= MAX_RENEWALS) {
      throw new UnprocessableEntityException(`Maximum renewals (${MAX_RENEWALS}) reached`);
    }

    // Check if this book has a pending reservation by another member
    const reservation = await this.prisma.libReservation.findFirst({
      where: {
        institute_id,
        book_id: issue.copy.book_id,
        status: 'pending',
        member_id: { not: issue.member_id },
      },
    });
    if (reservation) {
      throw new ConflictException(
        'Cannot renew — this title is reserved by another member',
      );
    }

    const rule = await this.rulesService.findByMemberType(institute_id, issue.member.member_type);
    const new_due_date = addDays(issue.due_date, rule.loan_period_days);

    return this.prisma.libIssueRecord.update({
      where: { issue_id: issueId },
      data: {
        due_date: new_due_date,
        renewal_count: { increment: 1 },
        status: 'issued',
      },
    });
  }

  async findOne(instituteId: string, issueId: number) {
    const issue = await this.prisma.libIssueRecord.findFirst({
      where: { issue_id: issueId, institute_id: requireInstituteId(instituteId) },
      include: {
        copy: { include: { book: true } },
        member: true,
        fines: true,
      },
    });
    if (!issue) throw new NotFoundException(`Issue record #${issueId} not found`);
    return issue;
  }

  async findOverdue(instituteId: string) {
    return this.prisma.libIssueRecord.findMany({
      where: { institute_id: requireInstituteId(instituteId), status: 'overdue' },
      include: {
        copy: { include: { book: { select: { title: true, author: true } } } },
        member: { select: { name: true, library_card_number: true, member_type: true } },
        fines: true,
      },
      orderBy: { due_date: 'asc' },
    });
  }

  async findAll(instituteId: string, status?: string) {
    const where: any = { institute_id: requireInstituteId(instituteId) };
    if (status) where.status = status;
    return this.prisma.libIssueRecord.findMany({
      where,
      include: {
        copy: { include: { book: { select: { title: true, author: true } } } },
        member: { select: { name: true, library_card_number: true, member_type: true } },
      },
      orderBy: { issue_date: 'desc' },
    });
  }
}
