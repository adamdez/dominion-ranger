/**
 * Universal CSV export utility
 * Takes an array of objects and column definitions, produces a downloadable CSV file
 */

export interface CsvColumn<T> {
  key: keyof T | ((row: T) => string | number | boolean | null | undefined);
  header: string;
}

export function exportToCsv<T extends object>(
  data: T[],
  columns: CsvColumn<T>[],
  filename: string
): void {
  if (data.length === 0) return;

  // Build header row
  const headers = columns.map((c) => `"${c.header}"`).join(',');

  // Build data rows
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value =
          typeof col.key === 'function' ? col.key(row) : row[col.key];

        // Handle null/undefined
        if (value === null || value === undefined) return '""';

        // Escape quotes and wrap in quotes
        const str = String(value).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(',')
  );

  // Combine and download
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
