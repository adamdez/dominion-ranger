/**
 * VERSE QUOTE RESEARCH SCRIPT
 * 
 * Fetches REAL commentary quotes from digitized Reformed theologians
 * for each of the 366 daily verses in Dominion Ranger.
 * 
 * Sources:
 * - CCEL.org — Calvin, Luther, Owen, Augustine, Ryle, Watson, Bunyan, etc.
 * - Spurgeon.org — Spurgeon's sermons and Treasury of David
 * - BibleStudyTools.com — Matthew Henry's Complete Commentary
 * - Edwards.yale.edu — Jonathan Edwards sermons/writings
 * 
 * Strategy:
 * - Calvin's Commentaries cover most of the Bible → primary backbone
 * - Matthew Henry covers entire Bible → secondary backbone
 * - Spurgeon's sermons + Treasury of David (Psalms) → Psalms + popular texts
 * - Luther's works → Psalms, Romans, Galatians, Genesis
 * - Edwards → select sermons on specific texts
 * - Owen, Ryle, Watson, Augustine → where their works address specific passages
 * 
 * Usage:
 *   npx tsx src/scripts/fetch-verse-quotes.ts
 * 
 * Output:
 *   data/verse-research/daily-verses-updated.ts — drop-in replacement
 *   data/verse-research/verse-quotes-report.json — full research log
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// CONFIGURATION
// ============================================================

const DELAY_MS = 1500;
const MAX_RETRIES = 2;
const OUTPUT_DIR = './data/verse-research';

// ============================================================
// TYPES
// ============================================================

interface ResearchResult {
  day: number;
  reference: string;
  author: string;
  quote: string;
  sourceTitle: string;
  sourceUrl: string;
  confidence: 'verified' | 'high' | 'medium' | 'low';
  method: string;
}

// ============================================================
// BIBLE BOOK NORMALIZATION
// ============================================================

function parseReference(ref: string): { book: string; chapter: number; startVerse: number; endVerse: number } | null {
  const match = ref.match(/^(\d?\s?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+):(\d+)(?:[–-](\d+))?$/);
  if (!match) return null;
  return {
    book: match[1].trim(),
    chapter: parseInt(match[2]),
    startVerse: parseInt(match[3]),
    endVerse: match[4] ? parseInt(match[4]) : parseInt(match[3]),
  };
}

const BOOK_SLUGS: Record<string, string> = {
  'Genesis': 'gen', 'Exodus': 'exod', 'Leviticus': 'lev', 'Numbers': 'num',
  'Deuteronomy': 'deut', 'Joshua': 'josh', 'Judges': 'judg', 'Ruth': 'ruth',
  '1 Samuel': '1sam', '2 Samuel': '2sam', '1 Kings': '1kgs', '2 Kings': '2kgs',
  '1 Chronicles': '1chr', '2 Chronicles': '2chr', 'Ezra': 'ezra', 'Nehemiah': 'neh',
  'Esther': 'esth', 'Job': 'job', 'Psalm': 'ps', 'Psalms': 'ps',
  'Proverbs': 'prov', 'Ecclesiastes': 'eccl', 'Song of Solomon': 'song',
  'Isaiah': 'isa', 'Jeremiah': 'jer', 'Lamentations': 'lam', 'Ezekiel': 'ezek',
  'Daniel': 'dan', 'Hosea': 'hos', 'Joel': 'joel', 'Amos': 'amos',
  'Obadiah': 'obad', 'Jonah': 'jonah', 'Micah': 'mic', 'Nahum': 'nah',
  'Habakkuk': 'hab', 'Zephaniah': 'zeph', 'Haggai': 'hag', 'Zechariah': 'zech',
  'Malachi': 'mal', 'Matthew': 'matt', 'Mark': 'mark', 'Luke': 'luke',
  'John': 'john', 'Acts': 'acts', 'Romans': 'rom', '1 Corinthians': '1cor',
  '2 Corinthians': '2cor', 'Galatians': 'gal', 'Ephesians': 'eph',
  'Philippians': 'phil', 'Colossians': 'col', '1 Thessalonians': '1thess',
  '2 Thessalonians': '2thess', '1 Timothy': '1tim', '2 Timothy': '2tim',
  'Titus': 'titus', 'Philemon': 'phlm', 'Hebrews': 'heb', 'James': 'jas',
  '1 Peter': '1pet', '2 Peter': '2pet', '1 John': '1john', '2 John': '2john',
  '3 John': '3john', 'Jude': 'jude', 'Revelation': 'rev',
};

// ============================================================
// HTTP FETCH WITH RETRIES
// ============================================================

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'DominionRanger-VerseResearch/1.0 (theological commentary research)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      if (response.ok) {
        return await response.text();
      }
      if (response.status === 404) return null;
      console.warn(`  Warning: HTTP ${response.status} for ${url}, retry ${i + 1}/${retries}`);
    } catch (err) {
      console.warn(`  Warning: Fetch error for ${url}: ${(err as Error).message}, retry ${i + 1}/${retries}`);
    }
    if (i < retries) await sleep(DELAY_MS * 2);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// COMMENTARY EXTRACTION FUNCTIONS
// ============================================================

function extractQuote(html: string, verseNum: number): string | null {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  const versePatterns = [
    new RegExp(`(?:verse|ver\\.?|v\\.?)\\s*${verseNum}[^\\d](.{100,500})`, 'i'),
    new RegExp(`${verseNum}\\.\\s+(.{100,500})`, 'i'),
  ];

  for (const pattern of versePatterns) {
    const match = text.match(pattern);
    if (match) {
      return cleanAndTrimQuote(match[1]);
    }
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 50 && s.length < 500);
  if (sentences.length > 0) {
    const commentary = sentences
      .filter(s => !s.match(/copyright|©|all rights reserved|navigation|menu|search/i))
      .slice(0, 3)
      .join(' ');
    if (commentary.length > 80) {
      return cleanAndTrimQuote(commentary);
    }
  }

  return null;
}

function cleanAndTrimQuote(text: string): string {
  let cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/^\W+/, '')
    .trim();

  const sentenceEnds = [...cleaned.matchAll(/[.!?]/g)];
  if (sentenceEnds.length >= 3) {
    const thirdEnd = sentenceEnds[2].index! + 1;
    cleaned = cleaned.slice(0, thirdEnd).trim();
  } else if (sentenceEnds.length >= 2) {
    const secondEnd = sentenceEnds[1].index! + 1;
    cleaned = cleaned.slice(0, secondEnd).trim();
  }

  if (!cleaned.match(/[.!?]$/)) {
    cleaned += '.';
  }

  if (cleaned.length > 500) {
    const lastPeriod = cleaned.lastIndexOf('.', 500);
    if (lastPeriod > 100) {
      cleaned = cleaned.slice(0, lastPeriod + 1);
    }
  }

  return cleaned;
}

// ============================================================
// SOURCE-SPECIFIC FETCHERS
// ============================================================

async function fetchCalvin(book: string, chapter: number, verse: number): Promise<{quote: string, sourceTitle: string, sourceUrl: string} | null> {
  const slug = BOOK_SLUGS[book];
  if (!slug) return null;

  const url = `https://biblehub.com/commentaries/calvin/${slug}/${chapter}.htm`;
  const html = await fetchWithRetry(url);
  if (!html) return null;

  const quote = extractQuote(html, verse);
  if (!quote) return null;

  return {
    quote,
    sourceTitle: `Calvin's Commentary on ${book} ${chapter}`,
    sourceUrl: url,
  };
}

async function fetchMatthewHenry(book: string, chapter: number, verse: number): Promise<{quote: string, sourceTitle: string, sourceUrl: string} | null> {
  const slug = book.toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.biblestudytools.com/commentaries/matthew-henry-complete/${slug}/${chapter}.html`;
  const html = await fetchWithRetry(url);
  if (!html) return null;

  const quote = extractQuote(html, verse);
  if (!quote) return null;

  return {
    quote,
    sourceTitle: `Matthew Henry's Complete Commentary on ${book} ${chapter}`,
    sourceUrl: url,
  };
}

async function fetchSpurgeon(book: string, chapter: number, verse: number): Promise<{quote: string, sourceTitle: string, sourceUrl: string} | null> {
  if (book === 'Psalm' || book === 'Psalms') {
    const url = `https://biblehub.com/commentaries/tod/${chapter}.htm`;
    const html = await fetchWithRetry(url);
    if (html) {
      const quote = extractQuote(html, verse);
      if (quote) {
        return {
          quote,
          sourceTitle: `Spurgeon's Treasury of David, Psalm ${chapter}`,
          sourceUrl: url,
        };
      }
    }
  }

  const slug = BOOK_SLUGS[book];
  if (!slug) return null;

  const url = `https://biblehub.com/commentaries/spurgeon/${slug}/${chapter}.htm`;
  const html = await fetchWithRetry(url);
  if (!html) return null;

  const quote = extractQuote(html, verse);
  if (!quote) return null;

  return {
    quote,
    sourceTitle: `Spurgeon on ${book} ${chapter}`,
    sourceUrl: url,
  };
}

async function fetchLuther(book: string, chapter: number, verse: number): Promise<{quote: string, sourceTitle: string, sourceUrl: string} | null> {
  const slug = BOOK_SLUGS[book];
  if (!slug) return null;

  const url = `https://biblehub.com/commentaries/luther/${slug}/${chapter}.htm`;
  const html = await fetchWithRetry(url);
  if (!html) return null;

  const quote = extractQuote(html, verse);
  if (!quote) return null;

  return {
    quote,
    sourceTitle: `Luther's Commentary on ${book} ${chapter}`,
    sourceUrl: url,
  };
}

async function fetchRyle(book: string, chapter: number, verse: number): Promise<{quote: string, sourceTitle: string, sourceUrl: string} | null> {
  const gospels = ['Matthew', 'Mark', 'Luke', 'John'];
  if (!gospels.includes(book)) return null;

  const slug = BOOK_SLUGS[book];
  const url = `https://biblehub.com/commentaries/ryle/${slug}/${chapter}.htm`;
  const html = await fetchWithRetry(url);
  if (!html) return null;

  const quote = extractQuote(html, verse);
  if (!quote) return null;

  return {
    quote,
    sourceTitle: `Ryle's Expository Thoughts on ${book} ${chapter}`,
    sourceUrl: url,
  };
}

async function fetchBibleHubCommentary(authorSlug: string, authorName: string, book: string, chapter: number, verse: number): Promise<{quote: string, sourceTitle: string, sourceUrl: string} | null> {
  const slug = BOOK_SLUGS[book];
  if (!slug) return null;

  const url = `https://biblehub.com/commentaries/${authorSlug}/${slug}/${chapter}.htm`;
  const html = await fetchWithRetry(url);
  if (!html) return null;

  const quote = extractQuote(html, verse);
  if (!quote) return null;

  return {
    quote,
    sourceTitle: `${authorName} on ${book} ${chapter}`,
    sourceUrl: url,
  };
}

// ============================================================
// AUTHOR ASSIGNMENT STRATEGY
// ============================================================

interface AuthorConfig {
  name: string;
  life: string;
  coverage: 'full' | 'gospels' | 'psalms' | 'epistles' | 'select';
  knownBooks: string[];
  primaryFetcher: (book: string, chapter: number, verse: number) => Promise<{quote: string, sourceTitle: string, sourceUrl: string} | null>;
  fallbackFetcher?: (book: string, chapter: number, verse: number) => Promise<{quote: string, sourceTitle: string, sourceUrl: string} | null>;
}

const AUTHORS: AuthorConfig[] = [
  {
    name: 'John Calvin',
    life: '1509–1564',
    coverage: 'full',
    knownBooks: Object.keys(BOOK_SLUGS),
    primaryFetcher: fetchCalvin,
  },
  {
    name: 'Matthew Henry',
    life: '1662–1714',
    coverage: 'full',
    knownBooks: Object.keys(BOOK_SLUGS),
    primaryFetcher: fetchMatthewHenry,
  },
  {
    name: 'Charles Spurgeon',
    life: '1834–1892',
    coverage: 'full',
    knownBooks: Object.keys(BOOK_SLUGS),
    primaryFetcher: fetchSpurgeon,
  },
  {
    name: 'Martin Luther',
    life: '1483–1546',
    coverage: 'select',
    knownBooks: ['Genesis', 'Psalm', 'Psalms', 'Romans', 'Galatians', 'Hebrews', 'John', '1 Peter', '2 Peter', 'Deuteronomy'],
    primaryFetcher: fetchLuther,
    fallbackFetcher: (b, c, v) => fetchBibleHubCommentary('luther', 'Martin Luther', b, c, v),
  },
  {
    name: 'J.C. Ryle',
    life: '1816–1900',
    coverage: 'gospels',
    knownBooks: ['Matthew', 'Mark', 'Luke', 'John'],
    primaryFetcher: fetchRyle,
  },
  {
    name: 'Jonathan Edwards',
    life: '1703–1758',
    coverage: 'select',
    knownBooks: ['Romans', '1 Corinthians', 'Psalm', 'Psalms', 'Isaiah', 'Revelation', 'John', 'Matthew', 'Genesis'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('edwards', 'Jonathan Edwards', b, c, v),
  },
  {
    name: 'John Owen',
    life: '1616–1683',
    coverage: 'select',
    knownBooks: ['Hebrews', 'Romans', 'Psalm', 'Psalms', 'John', 'Isaiah'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('owen', 'John Owen', b, c, v),
  },
  {
    name: 'Augustine of Hippo',
    life: '354–430',
    coverage: 'select',
    knownBooks: ['Psalm', 'Psalms', 'John', 'Romans', 'Genesis', '1 John', 'Matthew'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('augustine', 'Augustine', b, c, v),
  },
  {
    name: 'Thomas Watson',
    life: '1620–1686',
    coverage: 'select',
    knownBooks: ['Matthew', 'Romans', 'Psalm', 'Psalms', 'Philippians', 'Proverbs', '2 Corinthians'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('watson', 'Thomas Watson', b, c, v),
  },
  {
    name: 'John Bunyan',
    life: '1628–1688',
    coverage: 'select',
    knownBooks: ['Psalm', 'Psalms', 'Hebrews', 'John', 'Romans', 'Genesis', 'Revelation', 'Isaiah'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('bunyan', 'John Bunyan', b, c, v),
  },
  {
    name: 'George Whitefield',
    life: '1714–1770',
    coverage: 'select',
    knownBooks: ['Matthew', 'John', 'Romans', 'Acts', 'Luke', 'Genesis', '2 Corinthians', 'Ephesians'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('whitefield', 'George Whitefield', b, c, v),
  },
  {
    name: 'Richard Baxter',
    life: '1615–1691',
    coverage: 'select',
    knownBooks: ['Romans', 'Hebrews', 'Psalm', 'Psalms', 'Matthew', '1 Corinthians', 'Philippians'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('baxter', 'Richard Baxter', b, c, v),
  },
  {
    name: 'John Knox',
    life: '1514–1572',
    coverage: 'select',
    knownBooks: ['Psalm', 'Psalms', 'Isaiah', 'Daniel', 'Romans'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('knox', 'John Knox', b, c, v),
  },
  {
    name: 'William Tyndale',
    life: '1494–1536',
    coverage: 'select',
    knownBooks: ['Romans', 'Matthew', 'John', '1 John', 'Hebrews', 'Genesis'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('tyndale', 'William Tyndale', b, c, v),
  },
  {
    name: 'Heinrich Bullinger',
    life: '1504–1575',
    coverage: 'select',
    knownBooks: ['Hebrews', 'Romans', 'Matthew', 'Revelation', 'Isaiah', 'Daniel'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('bullinger', 'Heinrich Bullinger', b, c, v),
  },
  {
    name: 'Francis Turretin',
    life: '1623–1687',
    coverage: 'select',
    knownBooks: ['Romans', 'John', 'Hebrews', 'Genesis', 'Ephesians', 'Psalm', 'Psalms'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('turretin', 'Francis Turretin', b, c, v),
  },
  {
    name: 'Herman Bavinck',
    life: '1854–1921',
    coverage: 'select',
    knownBooks: ['Romans', 'John', 'Genesis', 'Ephesians', 'Hebrews', 'Psalm', 'Psalms', 'Colossians'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('bavinck', 'Herman Bavinck', b, c, v),
  },
  {
    name: 'B.B. Warfield',
    life: '1851–1921',
    coverage: 'select',
    knownBooks: ['Romans', '2 Timothy', '2 Peter', 'John', 'Hebrews', '1 John'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('warfield', 'B.B. Warfield', b, c, v),
  },
  {
    name: 'Abraham Kuyper',
    life: '1837–1920',
    coverage: 'select',
    knownBooks: ['Romans', 'Genesis', 'Psalm', 'Psalms', 'Proverbs', 'Colossians', 'Ephesians'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('kuyper', 'Abraham Kuyper', b, c, v),
  },
  {
    name: 'Huldrych Zwingli',
    life: '1484–1531',
    coverage: 'select',
    knownBooks: ['Matthew', 'Romans', 'John', 'Isaiah', 'Psalm', 'Psalms', 'Jeremiah'],
    primaryFetcher: (b, c, v) => fetchBibleHubCommentary('zwingli', 'Huldrych Zwingli', b, c, v),
  },
];

// ============================================================
// AUTHOR ASSIGNMENT ALGORITHM
// ============================================================

/**
 * For each verse, find the best author who has a known commentary on that book.
 * Prioritize less-used authors to keep distribution even.
 */
function assignAuthors(verses: Array<{day: number, reference: string, text: string}>): Array<{day: number, reference: string, text: string, author: AuthorConfig}> {
  const authorUsage: Map<string, number> = new Map();
  AUTHORS.forEach(a => authorUsage.set(a.name, 0));

  return verses.map(v => {
    const parsed = parseReference(v.reference);
    if (!parsed) {
      const author = AUTHORS[0];
      authorUsage.set(author.name, (authorUsage.get(author.name) || 0) + 1);
      return { ...v, author };
    }

    const eligible = AUTHORS.filter(a =>
      a.knownBooks.some(b => b.toLowerCase() === parsed.book.toLowerCase())
    );

    if (eligible.length === 0) {
      const fallbacks = AUTHORS.filter(a => a.coverage === 'full');
      const author = fallbacks.sort((a, b) =>
        (authorUsage.get(a.name) || 0) - (authorUsage.get(b.name) || 0)
      )[0];
      authorUsage.set(author.name, (authorUsage.get(author.name) || 0) + 1);
      return { ...v, author };
    }

    const author = eligible.sort((a, b) =>
      (authorUsage.get(a.name) || 0) - (authorUsage.get(b.name) || 0)
    )[0];
    authorUsage.set(author.name, (authorUsage.get(author.name) || 0) + 1);
    return { ...v, author };
  });
}

// ============================================================
// FILE PARSER — reads the actual daily-verses.ts format
// ============================================================

/**
 * Parse the existing daily-verses.ts which has this structure:
 *   // Day N
 *   {
 *     reference: "...",
 *     text: "...",
 *     author: "...",
 *     ...
 *   },
 *
 * No `day` property in the objects — day is indicated by comment + array index.
 */
function parseExistingVerses(content: string): Array<{day: number, reference: string, text: string}> {
  const results: Array<{day: number, reference: string, text: string}> = [];

  // Split by "// Day N" comments to get each block
  const blocks = content.split(/\/\/\s*Day\s+\d+/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const refMatch = block.match(/reference:\s*["']([^"']+)["']/);
    const textMatch = block.match(/text:\s*["']([\s\S]*?)["']\s*,\s*\n?\s*(?:author|commentary)/);

    if (refMatch) {
      results.push({
        day: i,
        reference: refMatch[1],
        text: textMatch ? textMatch[1].replace(/\\'/g, "'") : '',
      });
    }
  }

  return results;
}

// ============================================================
// MAIN RESEARCH PIPELINE
// ============================================================

async function main() {
  console.log('===============================================');
  console.log('  VERSE QUOTE RESEARCH SCRIPT');
  console.log('  Fetching real commentary quotes from');
  console.log('  Reformed theologians for 366 daily verses');
  console.log('===============================================\n');

  // Step 1: Read current verses
  console.log('Reading current daily-verses.ts...');
  const versesPath = path.resolve('frontend/src/data/daily-verses.ts');

  if (!fs.existsSync(versesPath)) {
    console.error('Cannot find frontend/src/data/daily-verses.ts');
    console.error('Run this script from the dominion-ranger repo root.');
    process.exit(1);
  }

  const verseFileContent = fs.readFileSync(versesPath, 'utf-8');
  const existingVerses = parseExistingVerses(verseFileContent);

  console.log(`  Found ${existingVerses.length} verses\n`);

  if (existingVerses.length < 300) {
    console.error(`Only found ${existingVerses.length} verses. Expected 366.`);
    console.error('The file format may have changed. Check the parser.');
    process.exit(1);
  }

  // Step 2: Assign authors
  console.log('Assigning authors to verses...');
  const assignments = assignAuthors(existingVerses);

  const dist: Record<string, number> = {};
  assignments.forEach(a => { dist[a.author.name] = (dist[a.author.name] || 0) + 1; });
  console.log('  Author distribution:');
  Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    console.log(`    ${name}: ${count} verses`);
  });
  console.log();

  // Step 3: Fetch quotes
  console.log('Fetching commentary quotes...');
  console.log('  This will take ~10-15 minutes (being respectful to servers)\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results: ResearchResult[] = [];
  const failures: Array<{day: number, reference: string, author: string, error: string}> = [];

  let fetched = 0;
  let found = 0;
  let missed = 0;

  for (const entry of assignments) {
    fetched++;
    const parsed = parseReference(entry.reference);

    process.stdout.write(`  [${fetched}/${assignments.length}] Day ${entry.day}: ${entry.reference} (${entry.author.name})...`);

    if (!parsed) {
      console.log(' [WARN] Cannot parse reference');
      failures.push({ day: entry.day, reference: entry.reference, author: entry.author.name, error: 'Cannot parse reference' });
      missed++;
      results.push({
        day: entry.day,
        reference: entry.reference,
        author: entry.author.name,
        quote: '',
        sourceTitle: '',
        sourceUrl: '',
        confidence: 'low',
        method: 'not-found',
      });
      continue;
    }

    let result = await entry.author.primaryFetcher(parsed.book, parsed.chapter, parsed.startVerse);

    if (!result && entry.author.fallbackFetcher) {
      result = await entry.author.fallbackFetcher(parsed.book, parsed.chapter, parsed.startVerse);
    }

    // Calvin as universal fallback
    if (!result && entry.author.name !== 'John Calvin') {
      result = await fetchCalvin(parsed.book, parsed.chapter, parsed.startVerse);
      if (result) {
        entry.author = AUTHORS[0];
      }
    }

    // Matthew Henry as last resort
    if (!result && entry.author.name !== 'Matthew Henry') {
      result = await fetchMatthewHenry(parsed.book, parsed.chapter, parsed.startVerse);
      if (result) {
        entry.author = AUTHORS[1];
      }
    }

    if (result && result.quote && result.quote.length > 50) {
      found++;
      console.log(` [OK] (${result.quote.slice(0, 60)}...)`);
      results.push({
        day: entry.day,
        reference: entry.reference,
        author: entry.author.name,
        quote: result.quote,
        sourceTitle: result.sourceTitle,
        sourceUrl: result.sourceUrl,
        confidence: 'high',
        method: 'fetched',
      });
    } else {
      missed++;
      console.log(' [MISS] No quote found');
      failures.push({ day: entry.day, reference: entry.reference, author: entry.author.name, error: 'No commentary found' });

      results.push({
        day: entry.day,
        reference: entry.reference,
        author: entry.author.name,
        quote: '',
        sourceTitle: '',
        sourceUrl: '',
        confidence: 'low',
        method: 'not-found',
      });
    }

    await sleep(DELAY_MS);

    // Save progress every 50 entries
    if (fetched % 50 === 0) {
      console.log(`\n  Progress: ${found} found, ${missed} missed out of ${fetched}\n`);
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'verse-quotes-progress.json'),
        JSON.stringify({ results, failures, progress: { fetched, found, missed } }, null, 2)
      );
    }
  }

  // Step 4: Generate output
  console.log('\n===============================================');
  console.log(`  RESULTS: ${found} quotes found, ${missed} missing`);
  console.log('===============================================\n');

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'verse-quotes-report.json'),
    JSON.stringify({
      results,
      failures,
      stats: { total: assignments.length, found, missed },
      generatedAt: new Date().toISOString(),
    }, null, 2)
  );
  console.log(`Research report: ${OUTPUT_DIR}/verse-quotes-report.json`);

  // Generate the updated daily-verses.ts matching the existing interface:
  //   { reference, text, author, authorLife, commentary, sourceTitle, sourceUrl }
  const outputEntries = assignments.map((entry) => {
    const research = results.find(r => r.day === entry.day);
    const commentary = research?.quote || '(Quote pending manual verification)';
    const sourceTitle = research?.sourceTitle || '';
    const sourceUrl = research?.sourceUrl || '';

    const escText = entry.text.replace(/'/g, "\\'");
    const escCommentary = commentary.replace(/'/g, "\\'");
    const escSourceTitle = sourceTitle.replace(/'/g, "\\'");

    return `// Day ${entry.day}
{
  reference: '${entry.reference}',
  text: '${escText}',
  author: '${entry.author.name}',
  authorLife: '${entry.author.life}',
  commentary: '${escCommentary}',
  sourceTitle: '${escSourceTitle}',
  sourceUrl: '${sourceUrl}',
}`;
  });

  const outputFile = `// AUTO-GENERATED by fetch-verse-quotes.ts on ${new Date().toISOString()}
// ${found} quotes fetched from real commentary sources
// ${missed} entries need manual verification (marked with "Quote pending")
//
// Sources: BibleHub (Calvin, Spurgeon, Luther, Ryle), BibleStudyTools (Matthew Henry)

export interface DailyVerse {
  reference: string;
  text: string;
  author: string;
  authorLife: string;
  commentary: string;
  sourceTitle: string;
  sourceUrl: string;
}

export const dailyVerses: DailyVerse[] = [
${outputEntries.join(',\n')}
];
`;

  const outputPath = path.join(OUTPUT_DIR, 'daily-verses-updated.ts');
  fs.writeFileSync(outputPath, outputFile);
  console.log(`Updated verses file: ${outputPath}`);
  console.log();
  console.log('NEXT STEPS:');
  console.log('1. Review verse-quotes-report.json for any "not-found" entries');
  console.log('2. Manually fill in any missing quotes');
  console.log('3. Copy daily-verses-updated.ts to frontend/src/data/daily-verses.ts');
  console.log('4. Restart frontend and verify');
}

main().catch(console.error);
