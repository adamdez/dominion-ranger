import type { IngestionAdapter, NormalizedRecord } from './interface.js';
import type { DistressEvent } from '../../db/schema/index.js';
import { logger } from '../../config/logger.js';

type EventType = DistressEvent['eventType'];

export class SheriffSaleAdapter implements IngestionAdapter {
  readonly name = 'sheriff_sale';
  readonly description = 'Spokane County — Sheriff sale / foreclosure listings';
  readonly sourceType = 'api' as const;

  async *fetchRecords(): AsyncGenerator<NormalizedRecord[], void, unknown> {
    try {
      logger.info('Fetching Spokane County foreclosure page');
      const records = await this.fetchForeclosurePage();
      if (records.length > 0) {
        logger.info({ count: records.length }, 'Found sheriff sale records');
        yield records;
      }
    } catch (err) {
      logger.error({ err }, 'Sheriff sale fetch failed — skipping');
    }
  }

  private async fetchForeclosurePage(): Promise<NormalizedRecord[]> {
    try {
      const url = 'https://www.spokanecounty.org/4458/Previous-Foreclosures';

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'DominionRanger/1.0 (real-estate-research; contact@dominionhomes.com)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Spokane foreclosure page returned non-OK status');
        return [];
      }

      const html = await response.text();

      if (!html.includes('foreclosure') && !html.includes('sale') && !html.includes('property')) {
        logger.warn('Spokane foreclosure page structure may have changed — returning empty.');
        return [];
      }

      return this.parseResults(html);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.warn('Spokane foreclosure page timed out');
      } else {
        logger.error({ err }, 'Sheriff sale fetch error');
      }
      return [];
    }
  }

  private parseResults(html: string): NormalizedRecord[] {
    logger.info(
      {
        htmlLength: html.length,
        hasTable: html.includes('<table'),
        hasTr: html.includes('<tr'),
      },
      'Sheriff sale HTML analysis',
    );
    return [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch('https://www.spokanecounty.org/4458/Previous-Foreclosures', {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'DominionRanger/1.0' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
