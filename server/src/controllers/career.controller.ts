import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as careerService from '../services/career.service';

// Blank text means "none" for the optional fields, so a cleared box clears.
const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

// https only: a posting's apply link is something we put in front of a
// visitor, so no javascript:, no plain http.
const applyUrl = z.union([
  z.string().trim().max(500).refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), {
    message: 'The apply link must start with https://',
  }),
  z.null(),
]).optional().transform((v) => (v === undefined ? undefined : v ? v : null));

const fields = {
  title: z.string().trim().min(1, 'Give the job a title').max(150),
  team: optionalText(80),
  location: z.string().trim().min(1, 'Say where the job is').max(120),
  type: z.enum(['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'CONTRACT']),
  description: z.string().trim().min(1, 'Describe the job').max(10000),
  applyUrl,
  published: z.boolean(),
};

const createSchema = z.object(fields).partial().required({ title: true, location: true, description: true });
const updateSchema = z.object(fields).partial();

export async function listPublished(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ jobs: await careerService.listPublishedJobs() });
  } catch (error) {
    next(error);
  }
}

export async function listAll(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ jobs: await careerService.listAllJobs() });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    res.status(201).json({ job: await careerService.createJob(req.user!.userId, parsed.data) });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    res.json({ job: await careerService.updateJob(req.user!.userId, String(req.params.id), parsed.data) });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await careerService.deleteJob(req.user!.userId, String(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
