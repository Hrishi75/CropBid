import { useState } from 'react';
import toast from 'react-hot-toast';
import { ExportChangedError } from './csvExport';

// The Export button on the admin pages. `run` builds and downloads the file
// and returns how many rows it held, or 0 when there was nothing to export.
export function ExportCsvButton({ run, noun }: { run: () => Promise<number>; noun: string }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const n = await run();
      if (n === 0) toast.error(`No ${noun}s match, so there is nothing to export`);
      else toast.success(`Exported ${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('CSV export failed:', err);
      toast.error(err instanceof ExportChangedError
        ? 'The list kept changing while it was exported. Try again in a moment.'
        : 'Export failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="cb-btn cb-btn-ghost" onClick={onClick} disabled={busy}>
      {busy ? 'Exporting…' : 'Export ↓ CSV'}
    </button>
  );
}
