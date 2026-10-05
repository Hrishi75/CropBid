// The ports and documents an export request can name, read once per app run.
//
// Every demand card would otherwise fetch the same two short lists. They come
// from the server (utils/exportSpec) rather than living here, so a port added
// there reaches the app without a release. A failed fetch is not cached, and
// the screens fall back to the raw code, which is ugly but never wrong.
import { useEffect, useState } from 'react';
import { fetchExportOptions } from '../api/endpoints';
import type { ExportOptions } from '../api/types';

let cached: ExportOptions | null = null;
let inflight: Promise<ExportOptions> | null = null;

function load(): Promise<ExportOptions> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetchExportOptions()
      .then((o) => { cached = o; return o; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useExportOptions(enabled = true): ExportOptions | null {
  const [opts, setOpts] = useState<ExportOptions | null>(cached);
  useEffect(() => {
    if (!enabled || cached) return;
    let on = true;
    load().then((o) => { if (on) setOpts(o); }).catch(() => {});
    return () => { on = false; };
  }, [enabled]);
  return opts;
}

export const portName = (opts: ExportOptions | null, code?: string | null) =>
  opts?.ports.find((p) => p.code === code)?.name ?? code ?? '';

export const docLabel = (opts: ExportOptions | null, code: string) =>
  opts?.docs.find((d) => d.code === code)?.label ?? code;
