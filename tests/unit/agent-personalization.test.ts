import { describe, it, expect, vi } from 'vitest';

// ─── Invite Token Validation ────────────────────────────

function validateInviteToken(data: {
  inviteToken: string | null;
  inviteAcceptedAt: Date | null;
  inviteTokenExpiresAt: Date | null;
}): { valid: boolean; error?: string } {
  if (!data.inviteToken) {
    return { valid: false, error: 'Invalid invite link' };
  }
  if (data.inviteAcceptedAt) {
    return { valid: false, error: 'This invite has already been used' };
  }
  if (data.inviteTokenExpiresAt && data.inviteTokenExpiresAt < new Date()) {
    return { valid: false, error: 'This invite link has expired' };
  }
  return { valid: true };
}

describe('Invite Token Validation', () => {
  it('rejects null token', () => {
    const result = validateInviteToken({
      inviteToken: null,
      inviteAcceptedAt: null,
      inviteTokenExpiresAt: null,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid invite link');
  });

  it('rejects already accepted invite', () => {
    const result = validateInviteToken({
      inviteToken: 'abc-123',
      inviteAcceptedAt: new Date('2026-01-01'),
      inviteTokenExpiresAt: new Date('2026-12-31'),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('already been used');
  });

  it('rejects expired invite', () => {
    const result = validateInviteToken({
      inviteToken: 'abc-123',
      inviteAcceptedAt: null,
      inviteTokenExpiresAt: new Date('2020-01-01'),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('accepts valid invite', () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const result = validateInviteToken({
      inviteToken: 'abc-123',
      inviteAcceptedAt: null,
      inviteTokenExpiresAt: future,
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts invite with no expiry', () => {
    const result = validateInviteToken({
      inviteToken: 'abc-123',
      inviteAcceptedAt: null,
      inviteTokenExpiresAt: null,
    });
    expect(result.valid).toBe(true);
  });
});

// ─── Agent Scoping Logic ─────────────────────────────────

type Role = 'ADMIN' | 'MANAGER' | 'AGENT' | 'FIELD' | 'READONLY';

function shouldScopeByAgent(role: Role): boolean {
  return role !== 'ADMIN' && role !== 'MANAGER';
}

function getDefaultFunnelView(role: Role): 'mine' | 'all' {
  return role === 'AGENT' ? 'mine' : 'all';
}

function buildLeadFilter(
  role: Role,
  userId: string,
  view?: 'mine' | 'unassigned' | 'all',
): { filterByAssignedTo?: string; filterUnassigned?: boolean } {
  if (!shouldScopeByAgent(role)) {
    if (view === 'mine') return { filterByAssignedTo: userId };
    if (view === 'unassigned') return { filterUnassigned: true };
    return {};
  }
  // Agent role
  if (view === 'unassigned') return { filterUnassigned: true };
  if (view === 'all') return {};
  return { filterByAssignedTo: userId };
}

describe('Agent Scoping', () => {
  it('ADMIN sees all leads by default', () => {
    const filter = buildLeadFilter('ADMIN', 'admin-1');
    expect(filter).toEqual({});
  });

  it('MANAGER sees all leads by default', () => {
    const filter = buildLeadFilter('MANAGER', 'mgr-1');
    expect(filter).toEqual({});
  });

  it('AGENT sees only their leads by default', () => {
    const filter = buildLeadFilter('AGENT', 'agent-1');
    expect(filter).toEqual({ filterByAssignedTo: 'agent-1' });
  });

  it('AGENT can view unassigned leads', () => {
    const filter = buildLeadFilter('AGENT', 'agent-1', 'unassigned');
    expect(filter).toEqual({ filterUnassigned: true });
  });

  it('AGENT can view all leads (read-only)', () => {
    const filter = buildLeadFilter('AGENT', 'agent-1', 'all');
    expect(filter).toEqual({});
  });

  it('ADMIN can filter to mine', () => {
    const filter = buildLeadFilter('ADMIN', 'admin-1', 'mine');
    expect(filter).toEqual({ filterByAssignedTo: 'admin-1' });
  });

  it('ADMIN can filter to unassigned', () => {
    const filter = buildLeadFilter('ADMIN', 'admin-1', 'unassigned');
    expect(filter).toEqual({ filterUnassigned: true });
  });

  it('default funnel view for AGENT is mine', () => {
    expect(getDefaultFunnelView('AGENT')).toBe('mine');
  });

  it('default funnel view for ADMIN is all', () => {
    expect(getDefaultFunnelView('ADMIN')).toBe('all');
  });

  it('default funnel view for MANAGER is all', () => {
    expect(getDefaultFunnelView('MANAGER')).toBe('all');
  });
});

// ─── Concurrent Claiming ──────────────────────────────────

interface LeadInstance {
  leadInstanceId: string;
  assignedTo: string | null;
  version: number;
}

type ClaimResult = { success: true; instance: LeadInstance } | { success: false; error: string };

function simulateClaim(
  lead: LeadInstance,
  userId: string,
  expectedVersion: number,
): ClaimResult {
  if (lead.assignedTo !== null) {
    return { success: false, error: 'Lead already claimed' };
  }
  if (lead.version !== expectedVersion) {
    return { success: false, error: 'Version conflict — lead was modified' };
  }
  return {
    success: true,
    instance: {
      ...lead,
      assignedTo: userId,
      version: lead.version + 1,
    },
  };
}

describe('Concurrent Claiming', () => {
  it('first agent successfully claims', () => {
    const lead: LeadInstance = { leadInstanceId: 'lead-1', assignedTo: null, version: 1 };
    const result = simulateClaim(lead, 'agent-A', 1);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.instance.assignedTo).toBe('agent-A');
      expect(result.instance.version).toBe(2);
    }
  });

  it('second agent fails to claim same lead', () => {
    const lead: LeadInstance = { leadInstanceId: 'lead-1', assignedTo: 'agent-A', version: 2 };
    const result = simulateClaim(lead, 'agent-B', 1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('already claimed');
    }
  });

  it('claim fails on version mismatch', () => {
    const lead: LeadInstance = { leadInstanceId: 'lead-1', assignedTo: null, version: 3 };
    const result = simulateClaim(lead, 'agent-A', 2);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Version conflict');
    }
  });

  it('two agents claiming simultaneously — only one succeeds', () => {
    let lead: LeadInstance = { leadInstanceId: 'lead-1', assignedTo: null, version: 1 };

    const resultA = simulateClaim(lead, 'agent-A', 1);
    expect(resultA.success).toBe(true);
    if (resultA.success) lead = resultA.instance;

    const resultB = simulateClaim(lead, 'agent-B', 1);
    expect(resultB.success).toBe(false);
  });
});

// ─── Password Change Validation ──────────────────────────

function validatePasswordChange(data: {
  currentPassword: string;
  newPassword: string;
  storedHash: string | null;
}): { valid: boolean; error?: string } {
  if (!data.storedHash) {
    return { valid: false, error: 'Cannot change password for this account' };
  }
  if (data.currentPassword.length === 0) {
    return { valid: false, error: 'Current password is required' };
  }
  if (data.newPassword.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  return { valid: true };
}

describe('Password Change Validation', () => {
  it('rejects when no stored hash', () => {
    const result = validatePasswordChange({
      currentPassword: 'old',
      newPassword: 'newpassword',
      storedHash: null,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects empty current password', () => {
    const result = validatePasswordChange({
      currentPassword: '',
      newPassword: 'newpassword',
      storedHash: '$2a$12$hash',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects short new password', () => {
    const result = validatePasswordChange({
      currentPassword: 'current',
      newPassword: 'short',
      storedHash: '$2a$12$hash',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('8 characters');
  });

  it('accepts valid password change', () => {
    const result = validatePasswordChange({
      currentPassword: 'current',
      newPassword: 'newpassword123',
      storedHash: '$2a$12$hash',
    });
    expect(result.valid).toBe(true);
  });
});

// ─── Notification Creation ──────────────────────────────

interface NotificationData {
  userId: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
}

function validateNotification(data: NotificationData): boolean {
  return !!(data.userId && data.type && data.title);
}

describe('Notification Creation', () => {
  it('valid notification on lead assignment', () => {
    const notification: NotificationData = {
      userId: 'agent-1',
      type: 'LEAD_ASSIGNED',
      title: '3 leads assigned to you',
      message: 'You have been assigned 3 new leads.',
      link: '/leads',
    };
    expect(validateNotification(notification)).toBe(true);
  });

  it('rejects notification without userId', () => {
    expect(validateNotification({ userId: '', type: 'TEST', title: 'Test' })).toBe(false);
  });

  it('rejects notification without type', () => {
    expect(validateNotification({ userId: 'user-1', type: '', title: 'Test' })).toBe(false);
  });

  it('rejects notification without title', () => {
    expect(validateNotification({ userId: 'user-1', type: 'TEST', title: '' })).toBe(false);
  });
});

// ─── Role-Based Dashboard Visibility ────────────────────

function getDashboardSections(role: Role): string[] {
  if (role === 'AGENT') {
    return ['personalStats', 'taskStats', 'tasksWidget', 'leadPipeline'];
  }
  return ['funnelStats', 'taskNewLeadCards', 'pipelineValue', 'pendingActions', 'tasksWidget', 'scoreDistribution', 'intelligence', 'leadPipeline', 'agentPerformance'];
}

describe('Dashboard Visibility by Role', () => {
  it('AGENT sees personal stats', () => {
    const sections = getDashboardSections('AGENT');
    expect(sections).toContain('personalStats');
    expect(sections).not.toContain('agentPerformance');
    expect(sections).not.toContain('funnelStats');
  });

  it('ADMIN sees all sections including agent performance', () => {
    const sections = getDashboardSections('ADMIN');
    expect(sections).toContain('agentPerformance');
    expect(sections).toContain('funnelStats');
    expect(sections).not.toContain('personalStats');
  });

  it('MANAGER sees same as admin', () => {
    const sections = getDashboardSections('MANAGER');
    expect(sections).toContain('agentPerformance');
  });
});

// ─── Header Menu Visibility ──────────────────────────────

function getMenuItems(role: Role): string[] {
  const items = ['My Profile', 'Sign Out'];
  if (role === 'ADMIN' || role === 'MANAGER') {
    items.splice(1, 0, 'Settings');
  }
  return items;
}

describe('Header Menu by Role', () => {
  it('ADMIN sees Settings', () => {
    expect(getMenuItems('ADMIN')).toContain('Settings');
  });

  it('MANAGER sees Settings', () => {
    expect(getMenuItems('MANAGER')).toContain('Settings');
  });

  it('AGENT does not see Settings', () => {
    expect(getMenuItems('AGENT')).not.toContain('Settings');
  });

  it('all roles see My Profile and Sign Out', () => {
    for (const role of ['ADMIN', 'MANAGER', 'AGENT'] as Role[]) {
      const items = getMenuItems(role);
      expect(items).toContain('My Profile');
      expect(items).toContain('Sign Out');
    }
  });
});
