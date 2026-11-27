// =============================================================================
// Careers — /careers
// =============================================================================
// Public page, no login needed, linked from the footer. The jobs are written by
// an admin at /admin/careers; only published ones come back from the API.
//
// Nobody applies through the site. "Apply" opens an email to CAREERS_EMAIL with
// the job in the subject, or the job's own https link if the admin gave one, so
// CropBid never stores a CV here (CLAUDE.md §12).
//
// The page is prerendered with the shell only (the jobs load in the browser),
// so the "no openings" line must not show until the list has actually come
// back: an empty list and a failed fetch are different claims.
// =============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArcMark, ArrowIcon, CBFooter } from './landing/shared';
import { SignInLink } from '../components/auth/SignInLink';
import api from '../lib/axios';
import { CAREERS_EMAIL, JOB_TYPE_LABEL, applyHref, type Job } from '../content/careers';

function JobItem({ job }: { job: Job }) {
  const external = Boolean(job.applyUrl);
  return (
    <details className="faq-item">
      <summary className="faq-q">
        <span>
          {job.title}
          <span className="cb-small" style={{ display: 'block', fontWeight: 400, color: 'var(--cb-ink-3)', marginTop: 4 }}>
            {[job.team, job.location, JOB_TYPE_LABEL[job.type]].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="faq-mark" aria-hidden="true" />
      </summary>
      <div className="faq-a">
        <p style={{ whiteSpace: 'pre-wrap' }}>{job.description}</p>
        <a
          href={applyHref(job)}
          className="cb-btn cb-btn-primary"
          style={{ marginTop: 16 }}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          Apply for this role
        </a>
      </div>
    </details>
  );
}

export function CareersPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let on = true;
    api.get('/careers/jobs')
      .then(({ data }) => { if (on) setJobs(data.jobs); })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, []);

  return (
    <div className="cb-landing rp">
      <header className="rp-nav">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <Link to="/">Marketplace</Link>
          <Link to="/rates">Live rates</Link>
          <Link to="/partner" className="nav-signin">Become a partner</Link>
          <SignInLink className="cb-btn cb-btn-primary">
            <ArrowIcon />
          </SignInLink>
        </nav>
      </header>

      <main className="rp-main">
        <div className="rp-head">
          <div>
            <span className="cb-chip cb-chip-sage" style={{ marginBottom: 14 }}>
              Careers
            </span>
            <h1 className="cb-h1">Work with us</h1>
            <p className="cb-body rp-lede">
              CropBid connects Indian farmers, shops and businesses directly, priced against the
              day's government mandi rate. We are a small team and every role here shapes how that
              works. The open roles are below.
            </p>
          </div>
        </div>

        <section style={{ marginTop: 40 }}>
          <h2 className="cb-h2" style={{ marginBottom: 16 }}>Open roles</h2>
          {failed ? (
            <p className="cb-body">
              The open roles could not be loaded. Refresh to try again, or write to{' '}
              <a href={`mailto:${CAREERS_EMAIL}`} style={{ color: 'var(--cb-ink-2)' }}>{CAREERS_EMAIL}</a>.
            </p>
          ) : jobs === null ? (
            <p className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>Loading open roles…</p>
          ) : jobs.length === 0 ? (
            <p className="cb-body">
              There are no open roles right now. Check back soon.
            </p>
          ) : (
            <div className="faq-list">
              {jobs.map((job) => <JobItem key={job.id} job={job} />)}
            </div>
          )}
        </section>

        <section style={{ marginTop: 44 }}>
          <div className="cb-card" style={{ padding: 24 }}>
            <h2 className="cb-h3" style={{ marginBottom: 6 }}>Don't see your role?</h2>
            <p className="cb-body" style={{ maxWidth: '60ch', marginBottom: 14 }}>
              If you want to build fairer markets for Indian agriculture, write to us with what you
              would like to work on and a little about yourself.
            </p>
            <a
              href={`mailto:${CAREERS_EMAIL}?subject=${encodeURIComponent('Careers at CropBid')}`}
              className="cb-btn cb-btn-primary"
            >
              {CAREERS_EMAIL}
            </a>
          </div>
        </section>
      </main>

      <CBFooter />
    </div>
  );
}
