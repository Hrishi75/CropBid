// =============================================================================
// AdminCareers: the jobs listed on /careers
// =============================================================================
// Add a job, edit it, publish or unpublish it, or delete it. A new job starts
// as a draft unless "Publish now" is ticked, and only published jobs reach the
// public page (GET /careers/jobs). The server holds the rules (career
// controller): title, place and description required, an apply link https
// only. A job with no link of its own is applied for by email.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import { ConfirmButton } from './ConfirmButton';
import { CAREERS_EMAIL, JOB_TYPE_LABEL, type Job, type JobType } from '../../content/careers';

export function AdminCareers() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const latest = useRef(0);

  useEffect(() => { load(); }, []);

  async function load() {
    const req = ++latest.current;
    setFailed(false);
    try {
      const res = await api.get('/admin/jobs');
      if (req !== latest.current) return;
      setJobs(res.data.jobs);
    } catch (err) {
      if (req !== latest.current) return;
      console.error('Failed to load jobs:', err);
      setFailed(true);
      setJobs([]);
    } finally {
      if (req === latest.current) setLoading(false);
    }
  }

  async function save(id: string | null, body: Record<string, unknown>, done: string): Promise<boolean> {
    try {
      if (id) await api.patch(`/admin/jobs/${id}`, body);
      else await api.post('/admin/jobs', body);
      toast.success(done);
      load();
      return true;
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not save');
      return false;
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/admin/jobs/${id}`);
      toast.success('Job deleted');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not delete');
    }
  }

  const live = jobs.filter((j) => j.published).length;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">
            Careers · {failed ? '—' : `${live} live, ${jobs.length - live} draft`}
          </div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Open roles<br />
            <span className="cb-italic">on the careers page.</span>
          </h1>
          <p className="cb-small" style={{ marginTop: 10, maxWidth: 640, color: 'var(--cb-ink-2)' }}>
            Published jobs show on <Link to="/careers">/careers</Link>, linked from the site footer.
            Candidates apply by email to {CAREERS_EMAIL} with the job title as the subject, or through
            the link you give a job. Nothing is collected on the site.
          </p>
        </div>
        <button type="button" className="cb-btn cb-btn-primary" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Add a job'}
        </button>
      </div>

      {adding && (
        <div className="cb-card" style={{ padding: 20, marginBottom: 20 }}>
          <JobForm
            onSave={async (body) => {
              if (await save(null, body, body.published ? 'Job published' : 'Draft saved')) setAdding(false);
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
      ) : failed ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">The jobs could not be loaded. Refresh to try again.</span>
        </div>
      ) : jobs.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">No jobs yet. The careers page says there are no open roles.</span>
        </div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {jobs.map((j, n) => (
            <Row
              key={j.id}
              job={j}
              last={n === jobs.length - 1}
              onSave={(body, done) => save(j.id, body, done)}
              onDelete={() => remove(j.id)}
            />
          ))}
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

function JobForm({ job, onSave }: { job?: Job; onSave: (body: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState(job?.title ?? '');
  const [team, setTeam] = useState(job?.team ?? '');
  const [location, setLocation] = useState(job?.location ?? '');
  const [type, setType] = useState<JobType>(job?.type ?? 'FULL_TIME');
  const [description, setDescription] = useState(job?.description ?? '');
  const [applyUrl, setApplyUrl] = useState(job?.applyUrl ?? '');
  const [publish, setPublish] = useState(false);

  const badLink = applyUrl.trim() !== '' && !/^https:\/\/\S+$/i.test(applyUrl.trim());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      title,
      team: team.trim() || null,
      location,
      type,
      description,
      applyUrl: applyUrl.trim() || null,
      // Editing leaves publishing to the row's own button.
      ...(job ? {} : { published: publish }),
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <Field label="JOB TITLE">
        <input className="cb-input" style={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={150} placeholder="e.g. Field operations lead" />
      </Field>
      <div className="cb-cols-2" style={{ gap: 12 }}>
        <Field label="TEAM (OPTIONAL)">
          <input className="cb-input" style={INPUT} value={team} onChange={(e) => setTeam(e.target.value)} maxLength={80} placeholder="e.g. Operations" />
        </Field>
        <Field label="LOCATION">
          <input className="cb-input" style={INPUT} value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={120} placeholder="e.g. Nagpur, or Remote" />
        </Field>
      </div>
      <Field label="TYPE">
        <select className="cb-input" style={INPUT} value={type} onChange={(e) => setType(e.target.value as JobType)}>
          {(Object.keys(JOB_TYPE_LABEL) as JobType[]).map((t) => (
            <option key={t} value={t}>{JOB_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </Field>
      <Field label="DESCRIPTION (WHAT THE JOB IS, WHO WE ARE LOOKING FOR)">
        <textarea className="cb-input" style={{ ...INPUT, minHeight: 140 }} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={10000} />
      </Field>
      <Field label={`APPLY LINK (OPTIONAL, HTTPS). LEFT BLANK, CANDIDATES EMAIL ${CAREERS_EMAIL.toUpperCase()}`}>
        <input className="cb-input" style={INPUT} value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} maxLength={500} placeholder="https://" />
      </Field>
      {badLink && (
        <span className="cb-tiny" style={{ color: 'var(--cb-ember)' }}>The apply link must start with https://</span>
      )}
      {!job && (
        <label className="cb-small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          Publish now (otherwise it is saved as a draft only admins can see)
        </label>
      )}
      <div>
        <button
          type="submit"
          className="cb-btn cb-btn-primary"
          disabled={!title.trim() || !location.trim() || !description.trim() || badLink}
        >
          {job ? 'Save' : publish ? 'Publish job' : 'Save draft'}
        </button>
      </div>
    </form>
  );
}

function Row({ job: j, last, onSave, onDelete }: {
  job: Job;
  last: boolean;
  onSave: (body: Record<string, unknown>, done: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div style={{ padding: '16px 20px', borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 500 }}>{j.title}</span>
        <span className="cb-mono cb-tiny" style={{ color: j.published ? 'var(--cb-sage)' : 'var(--cb-ink-3)' }}>
          ● {j.published ? 'LIVE' : 'DRAFT'}
        </span>
      </div>
      <div className="cb-small" style={{ marginBottom: 8 }}>
        {[j.team, j.location, JOB_TYPE_LABEL[j.type]].filter(Boolean).join(' · ')}
        {' · '}added {new Date(j.createdAt).toLocaleDateString()}
        {' · '}{j.applyUrl ? `apply at ${j.applyUrl}` : `apply by email`}
      </div>
      <div className="cb-small" style={{ color: 'var(--cb-ink-2)', whiteSpace: 'pre-wrap', maxHeight: 96, overflow: 'hidden' }}>
        {j.description}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, alignItems: 'baseline' }}>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Close' : 'Edit'}
        </button>
        {j.published ? (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }}
            onClick={() => onSave({ published: false }, 'Taken off the careers page')}>
            Unpublish
          </button>
        ) : (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }}
            onClick={() => onSave({ published: true }, 'Published on the careers page')}>
            Publish
          </button>
        )}
        <ConfirmButton label="Delete" confirmLabel="Delete this job for good?" onConfirm={onDelete} />
      </div>

      {editing && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--cb-line)' }}>
          <JobForm job={j} onSave={async (body) => { if (await onSave(body, 'Saved')) setEditing(false); }} />
        </div>
      )}
    </div>
  );
}
