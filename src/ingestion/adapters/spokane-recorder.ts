import type { IngestionAdapter, NormalizedRecord } from './interface.js';
import type { DistressEvent } from '../../db/schema/index.js';
import { logger } from '../../config/logger.js';
import { db } from '../../db/connection.js';
import { marketConfigs } from '../../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

type EventType = DistressEvent['eventType'];

const DOC_TYPES = [
  { search: 'Lis Pendens', event: 'LIS_PENDENS' as EventType, reliability: 0.98 },
  { search: 'Notice Of Trustee Sale', event: 'NOTICE_OF_TRUSTEE_SALE' as EventType, reliability: 0.98 },
];

export class SpokaneRecorderAdapter implements IngestionAdapter {
  readonly name = 'spokane_recorder';
  readonly description = 'Spokane County Auditor — Lis Pendens, NTS from recorder portal';
  readonly sourceType = 'api' as const;

  async *fetchRecords(): AsyncGenerator<NormalizedRecord[], void, unknown> {
    const [market] = await db
      .select()
      .from(marketConfigs)
      .where(and(eq(marketConfigs.county, 'SPOKANE'), eq(marketConfigs.state, 'WA')))
      .limit(1);

    if (!market?.active) {
      logger.warn('Spokane market not active, skipping recorder');
      return;
    }

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const docType of DOC_TYPES) {
      try {
        logger.info({ docType: docType.search }, 'Searching Spokane recorder');
        const records = await this.searchDocType(docType, startDate, endDate);
        if (records.length > 0) {
          logger.info({ docType: docType.search, count: records.length }, 'Found recorder records');
          yield records;
        }
        await new Promise((r) => setTimeout(r, 3000));
      } catch (err) {
        logger.error({ err, docType: docType.search }, 'Spokane recorder search failed — skipping');
      }
    }
  }

  private async searchDocType(
    docType: { search: string; event: EventType; reliability: number },
    _startDate: Date,
    _endDate: Date,
  ): Promise<NormalizedRecord[]> {
    try {
      const searchUrl = 'https://recording.spokanecounty.org/recorder/web/loginPOST.jsp?guest=true';

      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'DominionRanger/1.0 (real-estate-research; contact@dominionhomes.com)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Spokane recorder portal returned non-OK status');
        return [];
      }

      const html = await response.text();

      if (!html.includes('Recording Date') && !html.includes('Document') && !html.includes('Grantor')) {
        logger.warn('Spokane recorder portal may require JS rendering — returning empty. Consider upgrading to Playwright.');
        return [];
      }

      return this.parseResults(html, docType);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.warn('Spokane recorder portal timed out');
      } else {
        logger.error({ err }, 'Spokane recorder fetch error');
      }
      return [];
    }
  }

  private parseResults(
    html: string,
    docType: { search: string; event: EventType; reliability: number },
  ): NormalizedRecord[] {
    logger.info(
      {
        htmlLength: html.length,
        docType: docType.search,
        hasTable: html.includes('<table'),
        hasTr: html.includes('<tr'),
      },
      'Recorder HTML analysis',
    );
    return [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch('https://recording.spokanecounty.org/recorder/web/', {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'DominionRanger/1.0' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
