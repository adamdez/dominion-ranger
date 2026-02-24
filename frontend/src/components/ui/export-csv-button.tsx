'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { exportToCsv, type CsvColumn } from '@/lib/csv-export';
import api from '@/lib/api';
import { toast } from 'sonner';

interface ExportCsvButtonProps<T extends object> {
  data: T[];
  columns: CsvColumn<T>[];
  filename: string;
  disabled?: boolean;
  /** When set, if totalCount > data.length, shows confirmation and fetches full export from backend */
  totalCount?: number;
  /** Backend export URL (e.g. /api/leads/export?...) */
  exportUrl?: string;
}

export function ExportCsvButton<T extends object>({
  data,
  columns,
  filename,
  disabled,
  totalCount,
  exportUrl,
}: ExportCsvButtonProps<T>) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const isEmpty = data.length === 0;
  const needsBackendExport = exportUrl && totalCount != null && totalCount > data.length;
  const isDisabled = disabled ?? isEmpty;

  const doFrontendExport = () => {
    if (isEmpty) return;
    exportToCsv(data, columns, filename);
    toast.success(`Exported ${data.length} rows`);
  };

  const doBackendExport = async () => {
    if (!exportUrl) return;
    setIsExporting(true);
    try {
      const response = await api.get(exportUrl, { responseType: 'blob' });
      const blob = response.data as Blob;
      const contentDisposition = response.headers['content-disposition'];
      const match = contentDisposition?.match(/filename="?([^"]+)"?/);
      const downloadFilename = match?.[1] ?? `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${totalCount ?? 0} rows`);
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
      setConfirmOpen(false);
    }
  };

  const handleClick = () => {
    if (isEmpty) return;
    if (needsBackendExport) {
      setConfirmOpen(true);
    } else {
      doFrontendExport();
    }
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                disabled={isDisabled}
                onClick={handleClick}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {isEmpty ? 'No data to export' : needsBackendExport ? `Export all ${totalCount} rows` : `Export ${data.length} rows to CSV`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export all records?</AlertDialogTitle>
            <AlertDialogDescription>
              Export all {totalCount?.toLocaleString()} records? This may take a moment for large datasets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doBackendExport} disabled={isExporting}>
              {isExporting ? 'Exporting...' : 'Export'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
