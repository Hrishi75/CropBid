// =============================================================================
// AdminIncidents: the breach register
// =============================================================================
// Where a suspected personal data breach is written down the moment anyone
// suspects it. The DPDP Rules want the Data Protection Board and the people
// affected told without delay, and a detailed report to the Board within 72
// hours of becoming aware, so the page leads with that clock.
//
// The server holds the rules (services/incident.service.ts): no time in the
// future, nothing before detection, and an incident that touched personal data
// cannot be closed until the report and the notice to users are recorded. This
// page only makes them easy to follow. docs/breach-runbook.md is what to DO.
//
// A security alert (the bell, and the security inbox) links here.
// =============================================================================

import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

type Status = 'OPEN' | 'CONTAINED' | 'CLOSED';

interface Incident {
  id: string;
  title: string;
  description: string;
  detectedAt: string;
  status: Status;
  personalDataAffected: boolean;
  dataCategories: string | null;
  usersAffected: number | null;
  actionsTaken: string | null;
  exposureRuledOut: string | null;
  boardNotifiedAt: string | null;
  boardReportAt: string | null;
  usersNotifiedAt: string | null;
  reportDueAt: string;
  reportOverdue: boolean;
}

const META: Record<Status, { label: string; color: string }> = {
  OPEN: { label: 'OPEN', color: 'var(--cb-ember)' },
  CONTAINED: { label: 'CONTAINED', color: 'var(--cb-wheat)' },
  CLOSED: { label: 'CLOSED', color: 'var(--cb-ink-3)' },
};

// <input type="datetime-local"> speaks local time without a zone; the API
// speaks ISO. These two convert at the edge so nothing else has to.
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const nowLocal = () => toLocalInput(new Date().toISOString());

function timeLeft(dueIso: string): string {
  const ms = new Date(dueIso).getTime() - Date.now();
  const hours = Math.floor(Math.abs(ms) / 3600_000);
  const minutes = Math.floor((Math.abs(ms) % 3600_000) / 60_000);
  return ms >= 0 ? `${hours}h ${minutes}m left` : `${hours}h ${minutes}m overdue`;
}

interface Summary { notClosed: number; reportOwed: number; reportOverdue: number }

export function AdminIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  // Counted by the server over the whole register: a report owed on page two
  // is still owed, so the headline cannot be the rows on screen.
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get('/admin/incidents', { params: { page } });
      setIncidents(res.data.incidents);
      setSummary(res.data.summary);
      setPages(res.data.pagination?.totalPages ?? 1);
      setTotal(res.data.pagination?.total ?? res.data.incidents.length);
    } catch (err) {
      console.error('Failed to load incidents:', err);
      // Said, not shown as an empty register: "no incidents" is a claim.
      setFailed(true);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }

  async function save(id: string | null, body: Record<string, unknown>): Promise<boolean> {
    try {
      if (id) await api.patch(`/admin/incidents/${id}`, body);
      else await api.post('/admin/incidents', body);
      toast.success(id ? 'Saved' : 'Incident logged. The 72 hours have started.');
      load();
      return true;
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not save');
      return false;
    }
  }


  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Breach register · {failed ? '—' : total} logged</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Write it down<br />
            <span className="cb-italic">the moment you suspect it.</span>
          </h1>
          <p className="cb-small" style={{ marginTop: 10, maxWidth: 640, color: 'var(--cb-ink-2)' }}>
            If personal data may have been exposed, the Data Protection Board and the people affected
            must be told without delay, and the Board sent a detailed report within 72 hours of us
            becoming aware. Log it here first; the steps are in <code>docs/breach-runbook.md</code>.
          </p>
        </div>
        <button type="button" className="cb-btn cb-btn-primary" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Log an incident'}
        </button>
      </div>

      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Not closed</div>
          <div className="cb-kpi-value">{failed || !summary ? '—' : summary.notClosed}</div>
          <div className="cb-kpi-delta">open or contained</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Report owed</div>
          <div className="cb-kpi-value" style={summary?.reportOverdue ? { color: 'var(--cb-ember)' } : undefined}>
            {failed || !summary ? '—' : summary.reportOwed}
          </div>
          <div className="cb-kpi-delta">
            {summary?.reportOverdue ? `${summary.reportOverdue} past the 72 hours` : 'personal data, Board not yet sent the report'}
          </div>
        </div>
      </div>

      {adding && (
        <div className="cb-card" style={{ padding: 20, marginBottom: 20 }}>
          <IncidentForm
            onSave={async (body) => { if (await save(null, body)) setAdding(false); }}
          />
        </div>
      )}

      {loading ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
      ) : failed ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">The register could not be loaded. Refresh to try again.</span>
        </div>
      ) : incidents.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">Nothing logged.</span>
        </div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {incidents.map((i, n) => (
            <Row key={i.id} incident={i} last={n === incidents.length - 1} onSave={(body) => save(i.id, body)} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 }}>
          <button type="button" className="cb-btn cb-btn-link" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← newer</button>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>page {page} of {pages}</span>
          <button type="button" className="cb-btn cb-btn-link" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>older →</button>
        </div>
      )}
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{label}</span>
      {children}
    </label>
  );
}

const INPUT = { padding: '6px 10px', fontSize: 13 } as const;

// One form for logging and editing. Every field the register keeps is here,
// so an incident is worked on the page rather than in someone's notes.
function IncidentForm({ incident, onSave }: { incident?: Incident; onSave: (body: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState(incident?.title ?? '');
  const [description, setDescription] = useState(incident?.description ?? '');
  const [detectedAt, setDetectedAt] = useState(incident ? toLocalInput(incident.detectedAt) : nowLocal());
  const [personal, setPersonal] = useState(incident?.personalDataAffected ?? false);
  const [categories, setCategories] = useState(incident?.dataCategories ?? '');
  const [users, setUsers] = useState(incident?.usersAffected != null ? String(incident.usersAffected) : '');
  const [actions, setActions] = useState(incident?.actionsTaken ?? '');
  // Unticking "personal data" on an incident that had it ticked drops the duty
  // to tell the Board, so the server wants a reason (incident.service).
  const [ruledOut, setRuledOut] = useState('');
  const unticking = Boolean(incident?.personalDataAffected) && !personal;
  const [boardNotified, setBoardNotified] = useState(toLocalInput(incident?.boardNotifiedAt ?? null));
  const [boardReport, setBoardReport] = useState(toLocalInput(incident?.boardReportAt ?? null));
  const [usersNotified, setUsersNotified] = useState(toLocalInput(incident?.usersNotifiedAt ?? null));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      title,
      description,
      detectedAt: fromLocalInput(detectedAt),
      personalDataAffected: personal,
      dataCategories: categories || null,
      usersAffected: users ? Number(users) : null,
      actionsTaken: actions || null,
      ...(unticking ? { exposureRuledOut: ruledOut } : {}),
      boardNotifiedAt: fromLocalInput(boardNotified),
      boardReportAt: fromLocalInput(boardReport),
      usersNotifiedAt: fromLocalInput(usersNotified),
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <Field label="WHAT HAPPENED, IN A LINE">
        <input className="cb-input" style={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      </Field>
      <Field label="WHAT WE KNOW SO FAR">
        <textarea className="cb-input" style={{ ...INPUT, minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} required />
      </Field>
      <div className="cb-cols-2" style={{ gap: 12 }}>
        <Field label="WHEN WE BECAME AWARE (THE 72 HOURS START HERE)">
          <input className="cb-input" style={INPUT} type="datetime-local" value={detectedAt} onChange={(e) => setDetectedAt(e.target.value)} required />
        </Field>
        <Field label="PEOPLE AFFECTED (BEST ESTIMATE)">
          <input className="cb-input" style={INPUT} inputMode="numeric" value={users} onChange={(e) => setUsers(e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
      </div>
      <label className="cb-small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} />
        Personal data may have been exposed (then the Board and the people affected must be told)
      </label>
      {unticking && (
        <Field label="WHY EXPOSURE OF PERSONAL DATA HAS BEEN RULED OUT">
          <textarea className="cb-input" style={{ ...INPUT, minHeight: 60 }} value={ruledOut} onChange={(e) => setRuledOut(e.target.value)} required />
        </Field>
      )}
      {personal && (
        <Field label="WHAT KINDS OF PERSONAL DATA">
          <input className="cb-input" style={INPUT} value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="e.g. phone numbers, delivery addresses, bank details" />
        </Field>
      )}
      <Field label="WHAT WE HAVE DONE">
        <textarea className="cb-input" style={{ ...INPUT, minHeight: 60 }} value={actions} onChange={(e) => setActions(e.target.value)} placeholder="e.g. reset the admin password, rotated the database credentials" />
      </Field>
      {personal && (
        <div className="cb-cols-2" style={{ gap: 12 }}>
          <Field label="BOARD FIRST TOLD">
            <input className="cb-input" style={INPUT} type="datetime-local" value={boardNotified} onChange={(e) => setBoardNotified(e.target.value)} />
          </Field>
          <Field label="DETAILED REPORT SENT TO BOARD">
            <input className="cb-input" style={INPUT} type="datetime-local" value={boardReport} onChange={(e) => setBoardReport(e.target.value)} />
          </Field>
          <Field label="PEOPLE AFFECTED TOLD">
            <input className="cb-input" style={INPUT} type="datetime-local" value={usersNotified} onChange={(e) => setUsersNotified(e.target.value)} />
          </Field>
        </div>
      )}
      <div>
        <button type="submit" className="cb-btn cb-btn-primary" disabled={!title.trim() || !description.trim() || !detectedAt || (unticking && !ruledOut.trim())}>
          {incident ? 'Save' : 'Log incident'}
        </button>
      </div>
    </form>
  );
}

function Row({ incident: i, last, onSave }: {
  incident: Incident;
  last: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const meta = META[i.status];
  const reportOwed = i.personalDataAffected && !i.boardReportAt;

  return (
    <div style={{ padding: '16px 20px', borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <div>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>#I-{i.id.slice(-6).toUpperCase()}</span>
          <span style={{ fontWeight: 500 }}>{i.title}</span>
        </div>
        <span className="cb-mono cb-tiny" style={{ color: meta.color }}>● {meta.label}</span>
      </div>

      <div className="cb-small" style={{ marginBottom: 8 }}>
        Aware since {new Date(i.detectedAt).toLocaleString()}
        {i.personalDataAffected ? ` · personal data${i.dataCategories ? `: ${i.dataCategories}` : ''}` : ' · no personal data recorded as affected'}
        {i.usersAffected != null ? ` · about ${i.usersAffected.toLocaleString('en-IN')} people` : ''}
      </div>

      {reportOwed && i.status !== 'CLOSED' && (
        <div className="cb-mono cb-tiny" style={{ marginBottom: 8, color: i.reportOverdue ? 'var(--cb-ember)' : 'var(--cb-ink-2)' }}>
          REPORT TO THE BOARD DUE {new Date(i.reportDueAt).toLocaleString()} · {timeLeft(i.reportDueAt)}
        </div>
      )}

      <div className="cb-small" style={{ marginBottom: 8, color: 'var(--cb-ink-2)', whiteSpace: 'pre-wrap' }}>{i.description}</div>
      {i.exposureRuledOut && (
        <div className="cb-small" style={{ marginBottom: 8, color: 'var(--cb-ink-2)', whiteSpace: 'pre-wrap' }}>
          Personal data ruled out: {i.exposureRuledOut}
        </div>
      )}
      {i.actionsTaken && (
        <div className="cb-small" style={{ marginBottom: 8, color: 'var(--cb-ink-2)', whiteSpace: 'pre-wrap' }}>Done: {i.actionsTaken}</div>
      )}

      {i.personalDataAffected && (
        <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 8 }}>
          Board told {i.boardNotifiedAt ? new Date(i.boardNotifiedAt).toLocaleString() : 'not yet'}
          {' · '}report {i.boardReportAt ? new Date(i.boardReportAt).toLocaleString() : 'not yet'}
          {' · '}users told {i.usersNotifiedAt ? new Date(i.usersNotifiedAt).toLocaleString() : 'not yet'}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Close' : 'Update'}
        </button>
        {i.status === 'OPEN' && (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => onSave({ status: 'CONTAINED' })}>
            Mark contained
          </button>
        )}
        {i.status !== 'CLOSED' && (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => onSave({ status: 'CLOSED' })}>
            Close
          </button>
        )}
        {i.status === 'CLOSED' && (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => onSave({ status: 'OPEN' })}>
            Reopen
          </button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--cb-line)' }}>
          <IncidentForm incident={i} onSave={async (body) => { if (await onSave(body)) setEditing(false); }} />
        </div>
      )}
    </div>
  );
}
