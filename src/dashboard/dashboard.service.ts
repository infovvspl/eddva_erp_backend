import { Injectable } from '@nestjs/common';
import { DashboardService as AccountsDashboardService } from '../accounts/dashboard/dashboard.service';
import { DashboardService as SalesPurchaseDashboardService } from '../sales-purchase/dashboard/dashboard.service';
import { DashboardService as CanteenDashboardService } from '../canteen/dashboard/dashboard.service';
import { DashboardService as LibraryDashboardService } from '../library/dashboard/dashboard.service';
import { DashboardService as SportsDashboardService } from '../sports/dashboard/dashboard.service';
import { DashboardService as TransportDashboardService } from '../transport/dashboard/dashboard.service';
import { DashboardService as FrontOfficeDashboardService } from '../front-office/dashboard/dashboard.service';
import { DashboardService as InventoryDashboardService } from '../inventory/dashboard/dashboard.service';
import { DashboardService as AdmissionDashboardService } from '../admission/dashboard/dashboard.service';
import { DashboardService as HostelDashboardService } from '../hostel/dashboard/dashboard.service';
import { DashboardService as AlumniDashboardService } from '../alumni/dashboard/dashboard.service';
import { AdmissionReportQueryDto } from '../admission/reports/dto/report-query.dto';
import { AccountsPlatformUser } from '../accounts/auth/accounts-auth.service';

/**
 * Composes every module's own dashboard summary into one response for the
 * frontend's main landing page. Each module keeps its own auth island and
 * its own DashboardService — this only calls the plain, guard-agnostic
 * summary method each one already exposes, in parallel, via
 * Promise.allSettled so one module being slow or erroring never fails the
 * whole request. Central-login (Institute Admin) only — see
 * DashboardController.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly accounts: AccountsDashboardService,
    private readonly salesPurchase: SalesPurchaseDashboardService,
    private readonly canteen: CanteenDashboardService,
    private readonly library: LibraryDashboardService,
    private readonly sports: SportsDashboardService,
    private readonly transport: TransportDashboardService,
    private readonly frontOffice: FrontOfficeDashboardService,
    private readonly inventory: InventoryDashboardService,
    private readonly admission: AdmissionDashboardService,
    private readonly hostel: HostelDashboardService,
    private readonly alumni: AlumniDashboardService,
  ) {}

  async getSummary(coreUser: any) {
    const instituteId = coreUser?.instituteId;
    // Accounts' DashboardService reuses LedgerService methods that require a
    // full AccountsPlatformUser (not just an institute id) — the central
    // admin calling this aggregator isn't a real Accounts-island actor, so
    // build a compatible one from the core JWT payload.
    const accountsActor: AccountsPlatformUser = {
      eddva_user_id: coreUser?.id ?? coreUser?.userId,
      institute_id: instituteId,
      user_name: coreUser?.name,
      user_email: coreUser?.email,
      user_role: coreUser?.role,
      is_institute_admin: true,
    };

    const modules: Record<string, () => Promise<any>> = {
      accounts: () => this.accounts.getSummary(accountsActor),
      sales_purchase: () => this.salesPurchase.getSummary(instituteId),
      canteen: () => this.canteen.getSummary(instituteId),
      library: () => this.library.getSummary(),
      sports: () => this.sports.getSummary(),
      transport: () => this.transport.getSummary(instituteId),
      front_office: () => this.frontOffice.getSummary(instituteId),
      inventory: () => this.inventory.getSummary(instituteId),
      admission: () => this.admission.summary(instituteId, {} as AdmissionReportQueryDto),
      hostel: () => this.hostel.summary(instituteId, undefined, true),
      alumni: () => this.alumni.summary(instituteId),
    };

    const entries = Object.entries(modules);
    const results = await Promise.allSettled(entries.map(([, fn]) => fn()));

    const summary: Record<string, any> = {};
    results.forEach((result, i) => {
      const key = entries[i][0];
      summary[key] =
        result.status === 'fulfilled'
          ? result.value
          : { error: result.reason?.message ?? 'Failed to load this module\'s summary' };
    });

    return summary;
  }
}
