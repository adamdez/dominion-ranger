import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/business-rules.js';

export const leadsListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(BUSINESS_RULES.pagination.maxPageSize).default(BUSINESS_RULES.pagination.defaultPageSize),
  status: z.string().optional(),
  county: z.string().optional(),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['compositeScore', 'createdAt', 'updatedAt', 'status', 'ownerName', 'streetAddress', 'dealStage']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  tags: z.string().optional(),
  dealStage: z.string().optional(),
  hasPhone: z.enum(['true', 'false']).optional(),
  view: z.enum(['all', 'mine', 'unassigned']).default('all'),
});

export const claimLeadBody = z.object({
  expectedVersion: z.number().int().min(1).optional(),
});

export const transitionLeadBody = z.object({
  toStatus: z.string(),
  expectedVersion: z.number().int().min(1),
  notes: z.string().optional(),
});

export const dialQueueQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(BUSINESS_RULES.pagination.maxPageSize).default(BUSINESS_RULES.pagination.defaultPageSize),
});
