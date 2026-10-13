import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { parsePagination, buildMeta } from '../common/pagination.util';
import { FeeNumberingService } from '../common/fee-numbering.service';
import { FeeNotificationService } from '../notifications/fee-notification.service';
import { AutoPostingService } from '../../accounts/auto-posting/auto-posting.service';
import { RecordFeePaymentDto, QueryFeePaymentDto } from './dto/payment.dto';
import type { FeePlatformUser } from '../auth/student-fees-auth.service';

@Injectable()
export class FeePaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: FeeNumberingService,
    private readonly notifications: FeeNotificationService,
    private readonly autoPosting: AutoPostingService,
  ) {}

  /**
   * v1 scope note: unlike Admission's payment flow, this doesn't take a row
   * lock across the balance check — acceptable for now, but two concurrent
   * payments against the same structure could both pass the balance check.
   * Worth hardening the same way Admission does if this sees real traffic.
   */
  async record(actor: FeePlatformUser, dto: RecordFeePaymentDto) {
    const institute_id = requireInstituteId(actor.institute_id);

    if (dto.payment_mode !== 'cash' && !dto.transaction_ref?.trim()) {
      throw new BadRequestException(`A transaction reference is required for a ${dto.payment_mode.replace('_', ' ')} payment.`);
    }

    const student = await this.prisma.feeStudent.findFirst({ where: { student_id: dto.student_id, institute_id } });
    if (!student) throw new NotFoundException(`Student #${dto.student_id} not found`);

    const structure = await this.prisma.feeStructure.findFirst({ where: { structure_id: dto.structure_id, institute_id } });
    if (!structure) throw new NotFoundException(`Fee structure #${dto.structure_id} not found`);

    const paidAgg = await this.prisma.feePayment.aggregate({
      where: { student_id: dto.student_id, structure_id: dto.structure_id },
      _sum: { amount_paid: true },
    });
    const alreadyPaid = Number(paidAgg._sum.amount_paid ?? 0);
    const balance = Number(structure.amount) - alreadyPaid;
    if (dto.amount_paid > balance) {
      throw new BadRequestException(`This payment exceeds the outstanding balance of ${balance.toFixed(2)}`);
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const receipt_number = await this.numbering.nextReceiptNumber(institute_id, tx);
      return tx.feePayment.create({
        data: {
          institute_id,
          student_id: dto.student_id,
          structure_id: dto.structure_id,
          amount_paid: dto.amount_paid,
          payment_date: new Date(dto.payment_date),
          payment_mode: dto.payment_mode,
          transaction_ref: dto.transaction_ref?.trim() || null,
          receipt_number,
          recorded_by: actor.eddva_user_id,
        },
      });
    });

    const receiptMessage = `Receipt ${payment.receipt_number}: ₹${dto.amount_paid.toLocaleString('en-IN')} received for ${student.name} (${structure.term_name}).`;
    await this.notifications.queueMany([
      {
        instituteId: institute_id,
        entityType: 'fee_payment',
        entityId: payment.payment_id,
        eventType: 'payment_receipt',
        recipient: student.guardian_contact,
        channel: student.guardian_contact?.includes('@') ? 'email' : 'sms',
        message: receiptMessage,
      },
    ]);

    await this.autoPosting.postTuitionFeePayment({
      instituteId: institute_id,
      paymentId: payment.payment_id,
      studentId: dto.student_id,
      paymentDate: payment.payment_date,
      amountPaid: dto.amount_paid,
      userId: actor.eddva_user_id,
    });

    return payment;
  }

  async findAll(instituteId: string, query: QueryFeePaymentDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const institute_id = requireInstituteId(instituteId);
    const where = {
      institute_id,
      student_id: query.student_id,
      structure: {
        ...(query.class_id && { class_id: query.class_id }),
        ...(query.academic_year && { academic_year: query.academic_year }),
      },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.feePayment.findMany({
        where,
        include: { student: { include: { class: true } }, structure: true },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.feePayment.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const row = await this.prisma.feePayment.findFirst({
      where: { payment_id: id, institute_id: requireInstituteId(instituteId) },
      include: { student: { include: { class: true } }, structure: true },
    });
    if (!row) throw new NotFoundException(`Payment #${id} not found`);
    return row;
  }

  /** Per-student fee position across every structure for their class. */
  async balanceForStudent(instituteId: string, studentId: number) {
    const institute_id = requireInstituteId(instituteId);
    const student = await this.prisma.feeStudent.findFirst({ where: { student_id: studentId, institute_id } });
    if (!student) throw new NotFoundException(`Student #${studentId} not found`);

    const [structures, payments] = await Promise.all([
      this.prisma.feeStructure.findMany({ where: { institute_id, class_id: student.class_id } }),
      this.prisma.feePayment.groupBy({ by: ['structure_id'], where: { institute_id, student_id: studentId }, _sum: { amount_paid: true } }),
    ]);
    const paidByStructure = new Map(payments.map((p) => [p.structure_id, Number(p._sum.amount_paid ?? 0)]));

    return structures.map((s) => {
      const paid = paidByStructure.get(s.structure_id) ?? 0;
      const required = Number(s.amount);
      return {
        structure_id: s.structure_id,
        term_name: s.term_name,
        due_date: s.due_date,
        required,
        paid,
        balance: Math.max(0, required - paid),
        is_paid: paid >= required,
      };
    });
  }
}
