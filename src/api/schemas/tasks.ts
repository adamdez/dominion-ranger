import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/business-rules.js';

export const createTaskBody = z.object({
  title: z.string().min(1).max(256),
  description: z.string().optional(),
  taskType: z.enum(['CALLBACK', 'FOLLOW_UP', 'RESEARCH', 'SEND_OFFER', 'SITE_VISIT', 'GENERAL']).default('GENERAL'),
  leadInstanceId: z.string().uuid().optional(),
  dominionLeadId: z.string().uuid().optional(),
  assignedTo: z.string().max(128).optional(),
  dueAt: z.string().datetime().optional(),
  priority: z.enum(['HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
});

export const updateTaskBody = z.object({
  title: z.string().min(1).max(256).optional(),
  description: z.string().optional(),
  taskType: z.enum(['CALLBACK', 'FOLLOW_UP', 'RESEARCH', 'SEND_OFFER', 'SITE_VISIT', 'GENERAL']).optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  assignedTo: z.string().max(128).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export const tasksListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(BUSINESS_RULES.pagination.maxPageSize).default(BUSINESS_RULES.pagination.defaultPageSize),
  assignedTo: z.string().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  leadInstanceId: z.string().uuid().optional(),
  dominionLeadId: z.string().uuid().optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
});
