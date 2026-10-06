// The ports and documents an export request can name, read once from
// GET /requirements/export-options and shared, so the site keeps no copy of
// either list (server/src/utils/exportSpec.ts is the one).
import { useEffect, useState } from 'react';
import api from '../lib/axios';

export interface ExportOptions {
  ports: Array<{ code: string; name: string; city: string; state: string }>;
  docs: Array<{ code: string; label: string }>;
  moisture: { min: number; max: number };
}

let cached: Promise<ExportOptions | null> | null = null;

export function useExportOptions(enabled = true): ExportOptions | null {
  const [opts, setOpts] = useState<ExportOptions | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (!cached) {
      cached = api.get('/requirements/export-options').then((r) => r.data as ExportOptions).catch(() => {
        cached = null; // let a later card try again
        return null;
      });
    }
    let on = true;
    cached.then((o) => { if (on) setOpts(o); });
    return () => { on = false; };
  }, [enabled]);
  return opts;
}
