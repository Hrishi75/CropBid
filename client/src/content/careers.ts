// =============================================================================
// Careers: shared by /careers and /admin/careers
// =============================================================================
// The jobs themselves come from the API (GET /careers/jobs); this file only
// holds the words around them, so the public page and the admin preview say
// the same thing.
// =============================================================================

export type JobType = 'FULL_TIME' | 'PART_TIME' | 'INTERNSHIP' | 'CONTRACT';

export interface Job {
  id: string;
  title: string;
  team: string | null;
  location: string;
  type: JobType;
  description: string;
  applyUrl: string | null;
  createdAt: string;
  updatedAt: string;
  published?: boolean; // admin reads only
}

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  INTERNSHIP: 'Internship',
  CONTRACT: 'Contract',
};

/** Where an application goes when a job has no link of its own. */
export const CAREERS_EMAIL = 'info@cropbid.in';

/** The apply target: the job's own https link, else an email with the title as the subject. */
export function applyHref(job: Pick<Job, 'title' | 'applyUrl'>): string {
  if (job.applyUrl) return job.applyUrl;
  return `mailto:${CAREERS_EMAIL}?subject=${encodeURIComponent(`Application: ${job.title}`)}`;
}
