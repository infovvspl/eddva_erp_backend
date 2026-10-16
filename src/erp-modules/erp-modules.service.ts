import { Injectable, Logger } from '@nestjs/common';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Asks the LMS which ERP modules (by path, e.g. '/canteen') a given
 * institute has enabled, so the ERP app's own nav reflects what a super
 * admin toggled in the LMS instead of always showing every module.
 * Same LMS_BASE_URL / INTERNAL_API_KEY channel as staff/alumni/admission
 * lms-sync — the LMS exposes one internal API for all of these.
 */
@Injectable()
export class ErpModulesService {
  private readonly logger = new Logger(ErpModulesService.name);

  private config() {
    const baseUrl = process.env.LMS_BASE_URL?.replace(/\/+$/, '');
    const key = process.env.INTERNAL_API_KEY;
    return baseUrl && key ? { baseUrl, key } : null;
  }

  /**
   * Returns null (meaning "no restriction, show everything") when the LMS
   * integration isn't configured or the call fails — an institute with no
   * module catalogue configured in the LMS should not lose its ERP access
   * because of an infrastructure hiccup.
   */
  async getEnabledModulePaths(instituteId: string | null): Promise<string[] | null> {
    const cfg = this.config();
    if (!cfg || !instituteId) return null;

    try {
      const res = await fetch(
        `${cfg.baseUrl}/internal/erp/modules?instituteId=${encodeURIComponent(instituteId)}`,
        {
          headers: { 'x-internal-key': cfg.key },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!res.ok) throw new Error(`LMS ${res.status}: ${res.statusText}`);
      const body: any = await res.json().catch(() => ({}));
      const paths = body?.data;
      return Array.isArray(paths) ? paths : null;
    } catch (err) {
      this.logger.warn(`Enabled-modules lookup failed for institute ${instituteId}: ${(err as Error).message}`);
      return null;
    }
  }
}
