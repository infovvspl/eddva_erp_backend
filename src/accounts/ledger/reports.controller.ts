import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { LedgerService } from './ledger.service';
import { PdfService } from '../../pdf/pdf.service';

function parseDate(value: string | undefined, label: string): Date {
  if (!value) throw new BadRequestException(`${label} is required`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is not a valid date`);
  return date;
}

@ApiTags('Accounts / Reports')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/reports')
export class AccountsReportsController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly pdfService: PdfService,
  ) {}

  @Get('ledger/:accountId')
  @RequirePermission({ resource: 'ledger', action: 'read' })
  @ApiOperation({ summary: 'General Ledger for one account — opening balance, posted movements, running balance' })
  @ApiParam({ name: 'accountId' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  generalLedger(@Param('accountId') accountId: string, @AccountsUser() user: AccountsPlatformUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.ledgerService.generalLedger(accountId, parseDate(from, 'from'), parseDate(to, 'to'), user);
  }

  @Get('day-book')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Day Book — posted vouchers ordered by voucher date' })
  @ApiQuery({ name: 'date', required: false, description: 'Single day (defaults to today if from/to are also omitted)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  dayBook(@AccountsUser() user: AccountsPlatformUser, @Query('date') date?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const day = date ? parseDate(date, 'date') : undefined;
    const fromDate = from ? parseDate(from, 'from') : day ?? new Date(new Date().toDateString());
    const toDate = to ? parseDate(to, 'to') : day ?? new Date(new Date().toDateString());
    return this.ledgerService.dayBook(fromDate, toDate, user);
  }

  @Get('cash-book')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Cash Book — posted movements against ledger accounts flagged as cash accounts' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  cashBook(@AccountsUser() user: AccountsPlatformUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.ledgerService.cashBook(parseDate(from, 'from'), parseDate(to, 'to'), user);
  }

  @Get('bank-book')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Bank Book — posted movements against ledger accounts flagged as bank accounts' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  bankBook(@AccountsUser() user: AccountsPlatformUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.ledgerService.bankBook(parseDate(from, 'from'), parseDate(to, 'to'), user);
  }

  @Get('trial-balance')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Trial Balance for a financial year' })
  @ApiQuery({ name: 'fy_id', required: true })
  trialBalance(@AccountsUser() user: AccountsPlatformUser, @Query('fy_id') fyId?: string) {
    if (!fyId) throw new BadRequestException('fy_id is required');
    return this.ledgerService.trialBalance(fyId, user);
  }

  @Get('trial-balance/pdf')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Trial Balance as a downloadable PDF' })
  @ApiQuery({ name: 'fy_id', required: true })
  async trialBalancePdf(@AccountsUser() user: AccountsPlatformUser, @Res() res: Response, @Query('fy_id') fyId?: string) {
    if (!fyId) throw new BadRequestException('fy_id is required');
    const report = await this.ledgerService.trialBalance(fyId, user);
    const pdfBuffer = await this.pdfService.generateTrialBalancePdf(report);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="trial-balance-${report.fy.fyLabel}.pdf"`, 'Content-Length': pdfBuffer.length });
    res.end(pdfBuffer);
  }

  @Get('balance-sheet')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Balance Sheet as of a given date' })
  @ApiQuery({ name: 'as_of', required: true })
  balanceSheet(@AccountsUser() user: AccountsPlatformUser, @Query('as_of') asOf?: string) {
    return this.ledgerService.balanceSheet(parseDate(asOf, 'as_of'), user);
  }

  @Get('balance-sheet/pdf')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Balance Sheet as a downloadable PDF' })
  @ApiQuery({ name: 'as_of', required: true })
  async balanceSheetPdf(@AccountsUser() user: AccountsPlatformUser, @Res() res: Response, @Query('as_of') asOf?: string) {
    const report = await this.ledgerService.balanceSheet(parseDate(asOf, 'as_of'), user);
    const pdfBuffer = await this.pdfService.generateBalanceSheetPdf(report);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="balance-sheet-${new Date(asOf!).toISOString().slice(0, 10)}.pdf"`, 'Content-Length': pdfBuffer.length });
    res.end(pdfBuffer);
  }

  @Get('income-expenditure')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Income & Expenditure statement for a date range' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  incomeExpenditure(@AccountsUser() user: AccountsPlatformUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.ledgerService.incomeExpenditure(parseDate(from, 'from'), parseDate(to, 'to'), user);
  }
}
