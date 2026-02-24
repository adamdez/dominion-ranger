/**
 * Phase 3.6: Disposition → auto-task creation mapping
 * Verifies each disposition type creates correct task or no task
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockValues = vi.fn().mockResolvedValue([]);
const mockReturning = vi.fn().mockResolvedValue([]);
const mockInsert = vi.fn(() => ({
  values: mockValues.mockImplementation(() => ({ returning: mockReturning })),
}));

vi.mock('../../src/db/connection.js', () => ({
  db: { insert: mockInsert },
}));

vi.mock('../../src/config/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn() },
}));

const baseParams = {
  leadInstanceId: '11111111-1111-1111-1111-111111111111',
  dominionLeadId: '22222222-2222-2222-2222-222222222222',
  assignedTo: 'agent-1',
};

describe('createTaskFromDisposition', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it('creates task for NO_ANSWER', async () => {
    const { createTaskFromDisposition } = await import('../../src/modules/disposition-tasks/index.js');
    await createTaskFromDisposition({ ...baseParams, disposition: 'NO_ANSWER' });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Follow-up call',
        taskType: 'FOLLOW_UP',
        source: 'DISPOSITION',
      })
    );
  });

  it('creates task for LEFT_VOICEMAIL', async () => {
    const { createTaskFromDisposition } = await import('../../src/modules/disposition-tasks/index.js');
    await createTaskFromDisposition({ ...baseParams, disposition: 'LEFT_VOICEMAIL' });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Follow-up call', taskType: 'FOLLOW_UP' })
    );
  });

  it('creates task for CALLBACK_REQUESTED with callbackDate', async () => {
    const { createTaskFromDisposition } = await import('../../src/modules/disposition-tasks/index.js');
    await createTaskFromDisposition({
      ...baseParams,
      disposition: 'CALLBACK_REQUESTED',
      callbackDate: '2025-03-01T14:00:00.000Z',
    });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Callback', taskType: 'CALLBACK' })
    );
  });

  it('creates task for INTERESTED', async () => {
    const { createTaskFromDisposition } = await import('../../src/modules/disposition-tasks/index.js');
    await createTaskFromDisposition({ ...baseParams, disposition: 'INTERESTED' });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Send offer / comps', taskType: 'SEND_OFFER' })
    );
  });

  it('creates task for WRONG_NUMBER', async () => {
    const { createTaskFromDisposition } = await import('../../src/modules/disposition-tasks/index.js');
    await createTaskFromDisposition({ ...baseParams, disposition: 'WRONG_NUMBER' });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Re-skip trace', taskType: 'GENERAL' })
    );
  });

  it('creates task for DISCONNECTED', async () => {
    const { createTaskFromDisposition } = await import('../../src/modules/disposition-tasks/index.js');
    await createTaskFromDisposition({ ...baseParams, disposition: 'DISCONNECTED' });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Re-skip trace', taskType: 'GENERAL' })
    );
  });

  it('does NOT create task for NOT_INTERESTED', async () => {
    const { createTaskFromDisposition } = await import('../../src/modules/disposition-tasks/index.js');
    await createTaskFromDisposition({ ...baseParams, disposition: 'NOT_INTERESTED' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does NOT create task for DO_NOT_CALL', async () => {
    const { createTaskFromDisposition } = await import('../../src/modules/disposition-tasks/index.js');
    await createTaskFromDisposition({ ...baseParams, disposition: 'DO_NOT_CALL' });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
