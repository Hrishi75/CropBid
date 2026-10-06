import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as incidentService from '../services/incident.service';

// Times arrive as ISO strings; null clears one that was entered by mistake.
const when = z.coerce.date();
const optionalWhen = z.union([z.null(), when]).optional();
const text = (max: number) => z.string().max(max);

const fields = {
  title: text(200),
  description: text(5000),
  detectedAt: when,
  status: z.enum(['OPEN', 'CONTAINED', 'CLOSED']),
  personalDataAffected: z.boolean(),
  dataCategories: text(500).nullable(),
  usersAffected: z.number().int().min(0).nullable(),
  actionsTaken: text(5000).nullable(),
  boardNotifiedAt: optionalWhen,
  boardReportAt: optionalWhen,
  usersNotifiedAt: optionalWhen,
};

const createSchema = z.object(fields).partial().required({ title: true, description: true });
const updateSchema = z.object(fields).partial();

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await incidentService.listIncidents(Number(req.query.page) || 1));
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
    res.status(201).json({ incident: await incidentService.createIncident(req.user!.userId, parsed.data) });
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
    res.json({ incident: await incidentService.updateIncident(req.user!.userId, String(req.params.id), parsed.data) });
  } catch (error) {
    next(error);
  }
}
