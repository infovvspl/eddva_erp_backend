import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreatePosTerminalDto } from './dto/create-pos-terminal.dto';
import { UpdatePosTerminalDto } from './dto/update-pos-terminal.dto';
import { OpenPosShiftDto } from './dto/open-pos-shift.dto';
import { ClosePosShiftDto } from './dto/close-pos-shift.dto';

@Injectable()
export class CanteenPosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // --- Terminals ---
  async getTerminals() {
    return this.prisma.canteenPosTerminal.findMany({
      include: {
        _count: { select: { shifts: true, orders: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getTerminalById(id: string) {
    const terminal = await this.prisma.canteenPosTerminal.findUnique({
      where: { id },
      include: {
        shifts: {
          orderBy: { shiftStart: 'desc' },
          take: 5,
        },
      },
    });
    if (!terminal) {
      throw new NotFoundException('POS terminal not found.');
    }
    return terminal;
  }

  async createTerminal(dto: CreatePosTerminalDto, actorUserId?: string) {
    const existing = await this.prisma.canteenPosTerminal.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Terminal with name '${dto.name}' already exists.`);
    }

    const terminal = await this.prisma.canteenPosTerminal.create({
      data: {
        name: dto.name,
        location: dto.location || null,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenPosTerminal',
      entityId: terminal.id,
      action: 'POS Terminal Created',
      metadata: { name: terminal.name },
    });

    return terminal;
  }

  async updateTerminal(id: string, dto: UpdatePosTerminalDto, actorUserId?: string) {
    const terminal = await this.getTerminalById(id);

    if (dto.name && dto.name !== terminal.name) {
      const existing = await this.prisma.canteenPosTerminal.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException(`Terminal '${dto.name}' already exists.`);
      }
    }

    const updated = await this.prisma.canteenPosTerminal.update({
      where: { id },
      data: {
        name: dto.name ?? terminal.name,
        location: dto.location !== undefined ? dto.location : terminal.location,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenPosTerminal',
      entityId: id,
      action: 'POS Terminal Updated',
      metadata: { name: updated.name },
    });

    return updated;
  }

  async deleteTerminal(id: string, actorUserId?: string) {
    const terminal = await this.prisma.canteenPosTerminal.findUnique({
      where: { id },
      include: { shifts: true, orders: true },
    });
    if (!terminal) {
      throw new NotFoundException('POS terminal not found.');
    }

    if (terminal.shifts.length > 0 || terminal.orders.length > 0) {
      throw new BadRequestException(
        `Cannot delete terminal '${terminal.name}' because it has historical shifts or orders.`,
      );
    }

    await this.prisma.canteenPosTerminal.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenPosTerminal',
      entityId: id,
      action: 'POS Terminal Deleted',
      metadata: { name: terminal.name },
    });

    return { message: `Terminal '${terminal.name}' deleted successfully.` };
  }

  // --- POS Shifts ---
  async openShift(dto: OpenPosShiftDto, staffUserId: string) {
    await this.getTerminalById(dto.terminalId);

    // Rule: Only ONE active OPEN shift per terminal
    const activeShift = await this.prisma.canteenPosShift.findFirst({
      where: {
        terminalId: dto.terminalId,
        status: 'OPEN',
      },
    });

    if (activeShift) {
      throw new ConflictException(
        `POS terminal already has an active OPEN shift (Shift ID: ${activeShift.id}). Close the current shift before opening a new one.`,
      );
    }

    const shift = await this.prisma.canteenPosShift.create({
      data: {
        terminalId: dto.terminalId,
        staffId: staffUserId,
        openingCash: dto.openingCash,
        status: 'OPEN',
        shiftStart: new Date(),
      },
      include: {
        terminal: true,
        staff: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditService.log({
      userId: staffUserId,
      entityType: 'CanteenPosShift',
      entityId: shift.id,
      action: 'POS Shift Opened',
      metadata: { terminalId: shift.terminalId, openingCash: dto.openingCash },
    });

    return shift;
  }

  async getShifts(params: {
    page?: number;
    limit?: number;
    terminalId?: string;
    staffId?: string;
    status?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.terminalId) where.terminalId = params.terminalId;
    if (params.staffId) where.staffId = params.staffId;
    if (params.status) where.status = params.status;

    const [total, data] = await Promise.all([
      this.prisma.canteenPosShift.count({ where }),
      this.prisma.canteenPosShift.findMany({
        where,
        skip,
        take: limit,
        orderBy: { shiftStart: 'desc' },
        include: {
          terminal: true,
          staff: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getShiftById(id: string) {
    const shift = await this.prisma.canteenPosShift.findUnique({
      where: { id },
      include: {
        terminal: true,
        staff: { select: { id: true, name: true, email: true } },
      },
    });
    if (!shift) {
      throw new NotFoundException('POS shift not found.');
    }
    return shift;
  }

  async closeShift(id: string, dto: ClosePosShiftDto, actorUserId?: string) {
    const shift = await this.getShiftById(id);

    if (shift.status === 'CLOSED') {
      throw new BadRequestException('This POS shift is already closed.');
    }

    // Execute expected cash calculation and closing inside atomic transaction
    return this.prisma.$transaction(async (tx) => {
      // Fetch successful cash payments associated with orders created on this terminal during this shift
      const cashPayments = await tx.canteenPayment.findMany({
        where: {
          paymentMode: 'CASH',
          status: 'success',
          paidAt: { gte: shift.shiftStart },
          order: { terminalId: shift.terminalId },
        },
      });

      const totalCashPayments = cashPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );

      // Fetch cash refunds
      const cashRefunds = await tx.canteenPayment.findMany({
        where: {
          paymentMode: 'CASH',
          status: 'refunded',
          paidAt: { gte: shift.shiftStart },
          order: { terminalId: shift.terminalId },
        },
      });

      const totalCashRefunds = cashRefunds.reduce(
        (sum, r) => sum + Number(r.amount),
        0,
      );

      const openingCash = Number(shift.openingCash);
      const expectedCash = openingCash + totalCashPayments - totalCashRefunds;
      const closingCash = Number(dto.closingCash);
      const variance = closingCash - expectedCash;
      const shiftEnd = new Date();

      const closedShift = await tx.canteenPosShift.update({
        where: { id },
        data: {
          closingCash,
          expectedCash,
          variance,
          shiftEnd,
          status: 'CLOSED',
        },
        include: {
          terminal: true,
          staff: { select: { id: true, name: true, email: true } },
        },
      });

      await this.auditService.log({
        userId: actorUserId,
        entityType: 'CanteenPosShift',
        entityId: id,
        action: 'POS Shift Closed',
        metadata: {
          openingCash,
          totalCashPayments,
          totalCashRefunds,
          expectedCash,
          closingCash,
          variance,
        },
      });

      return closedShift;
    });
  }
}
