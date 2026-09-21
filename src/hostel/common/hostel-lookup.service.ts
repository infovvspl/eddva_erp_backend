import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Institute-scoped existence checks shared by every Hostel service. Each
 * accepts an optional transaction client so the check participates in the
 * caller's transaction. A row belonging to another institute is reported as
 * "not found", never leaked.
 *
 * The `lock*` helpers take a `SELECT … FOR UPDATE` row lock held until the
 * surrounding transaction ends, serialising the operations that must not race
 * (allotments into one room, payments against one invoice, scans of one pass).
 * They MUST be called inside `$transaction`.
 */
@Injectable()
export class HostelLookupService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  async block(instituteId: string, id: number, tx?: Prisma.TransactionClient) {
    const row = await this.db(tx).hostelBlock.findFirst({
      where: { block_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!row) throw new NotFoundException(`Hostel block #${id} not found`);
    return row;
  }

  async room(instituteId: string, id: number, tx?: Prisma.TransactionClient) {
    const row = await this.db(tx).hostelRoom.findFirst({
      where: { room_id: id, institute_id: instituteId, deleted_at: null },
      include: { block: true },
    });
    if (!row) throw new NotFoundException(`Room #${id} not found`);
    return row;
  }

  async bed(instituteId: string, id: number, tx?: Prisma.TransactionClient) {
    const row = await this.db(tx).hostelBed.findFirst({
      where: { bed_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!row) throw new NotFoundException(`Bed #${id} not found`);
    return row;
  }

  async resident(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).hostelResident.findFirst({
      where: { resident_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Hostel resident #${id} not found`);
    return row;
  }

  async allotment(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).hostelRoomAllotment.findFirst({
      where: { allotment_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Allotment #${id} not found`);
    return row;
  }

  async gatePass(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).hostelGatePass.findFirst({
      where: { gate_pass_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Gate pass #${id} not found`);
    return row;
  }

  async complaint(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).hostelComplaint.findFirst({
      where: { complaint_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Complaint #${id} not found`);
    return row;
  }

  async feePlan(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).hostelFeePlan.findFirst({
      where: { fee_plan_id: id, institute_id: instituteId, deleted_at: null },
    });
    if (!row) throw new NotFoundException(`Fee plan #${id} not found`);
    return row;
  }

  async invoice(
    instituteId: string,
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).hostelFeeInvoice.findFirst({
      where: { invoice_id: id, institute_id: instituteId },
    });
    if (!row) throw new NotFoundException(`Invoice #${id} not found`);
    return row;
  }

  /** Active staff assignment in this institute — the only valid target for warden / assignee ids. */
  async staffMember(
    instituteId: string,
    eddvaUserId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const row = await this.db(tx).hostelUserDynamicRole.findFirst({
      where: {
        institute_id: instituteId,
        eddva_user_id: eddvaUserId,
        is_active: true,
      },
      select: { eddva_user_id: true, user_name: true },
    });
    if (!row) {
      throw new NotFoundException(
        `No active hostel staff member with id "${eddvaUserId}" in this institute`,
      );
    }
    return row;
  }

  // ─── Row locks ────────────────────────────────────────────────────────────

  async lockRooms(
    instituteId: string,
    ids: number[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const unique = [...new Set(ids)].sort((a, b) => a - b); // fixed order → no deadlocks
    if (unique.length === 0) return;
    const locked = await tx.$queryRaw<Array<{ room_id: number }>>(Prisma.sql`
      SELECT room_id FROM hostel_rooms
      WHERE room_id IN (${Prisma.join(unique)}) AND institute_id = ${instituteId} AND deleted_at IS NULL
      ORDER BY room_id
      FOR UPDATE
    `);
    if (locked.length !== unique.length) {
      throw new NotFoundException('Room not found');
    }
  }

  async lockResident(
    instituteId: string,
    id: number,
    tx: Prisma.TransactionClient,
  ) {
    const locked = await tx.$queryRaw<
      Array<{ resident_id: number }>
    >(Prisma.sql`
      SELECT resident_id FROM hostel_residents
      WHERE resident_id = ${id} AND institute_id = ${instituteId}
      FOR UPDATE
    `);
    if (locked.length === 0) {
      throw new NotFoundException(`Hostel resident #${id} not found`);
    }
    return this.resident(instituteId, id, tx);
  }

  async lockInvoice(
    instituteId: string,
    id: number,
    tx: Prisma.TransactionClient,
  ) {
    const locked = await tx.$queryRaw<Array<{ invoice_id: number }>>(Prisma.sql`
      SELECT invoice_id FROM hostel_fee_invoices
      WHERE invoice_id = ${id} AND institute_id = ${instituteId}
      FOR UPDATE
    `);
    if (locked.length === 0) {
      throw new NotFoundException(`Invoice #${id} not found`);
    }
    return this.invoice(instituteId, id, tx);
  }

  async lockGatePass(
    instituteId: string,
    id: number,
    tx: Prisma.TransactionClient,
  ) {
    const locked = await tx.$queryRaw<
      Array<{ gate_pass_id: number }>
    >(Prisma.sql`
      SELECT gate_pass_id FROM hostel_gate_passes
      WHERE gate_pass_id = ${id} AND institute_id = ${instituteId}
      FOR UPDATE
    `);
    if (locked.length === 0) {
      throw new NotFoundException(`Gate pass #${id} not found`);
    }
    return this.gatePass(instituteId, id, tx);
  }
}
