import { Request, Response, NextFunction } from 'express';
import * as agentService from '../services/agent.service';

// GET /api/agent/config — Get current user's agent config
export async function getConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await agentService.getAgentConfig(req.user!.userId, req.user!.role);
    res.json(config);
  } catch (error) {
    next(error);
  }
}

// PUT /api/agent/config — Update agent config
export async function updateConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await agentService.updateAgentConfig(
      req.user!.userId,
      req.user!.role,
      req.body
    );
    res.json(config);
  } catch (error) {
    next(error);
  }
}

// POST /api/agent/toggle — Toggle agent on/off
export async function toggleAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await agentService.toggleAgent(req.user!.userId, req.user!.role);
    res.json(config);
  } catch (error) {
    next(error);
  }
}
