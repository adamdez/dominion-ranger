import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import {
  getTestDb,
  cleanupTables,
  closeTestDb,
  isTestDbAvailable,
} from '../helpers/test-db.js';
import {
  callLogs,
  smsLogs,
  properties,
  activityLog,
} from '../../src/db/schema/index.js';
import { generateClientToken } from '../../src/modules/dialer/call-service.js';

const TEST_PROPERTY_ID = '00000000-0000-0000-0000-000000000099';

describe.skipIf(!isTestDbAvailable())('Dialer Integration Tests', () => {
  const db = getTestDb();

  beforeAll(async () => {
    await cleanupTables();
  });

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM call_logs`);
    await db.execute(sql`DELETE FROM sms_logs`);
    await db.execute(sql`ALTER TABLE activity_log DISABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM activity_log`);
    await db.execute(sql`ALTER TABLE activity_log ENABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM properties WHERE dominion_lead_id = ${TEST_PROPERTY_ID}`);
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  async function insertTestProperty(phone?: string) {
    await db.insert(properties).values({
      dominionLeadId: TEST_PROPERTY_ID,
      propertyId: '00000000-0000-0000-0000-000000000098',
      apn: 'TEST-APN-DIALER',
      county: 'SPOKANE',
      state: 'WA',
      streetAddress: '123 Test St',
      phone: phone ?? '5095550123',
    } as Record<string, unknown>);
  }

  describe('Token generation', () => {
    it('throws when Twilio env vars are not set', () => {
      const originalKey = process.env.TWILIO_API_KEY;
      const originalSecret = process.env.TWILIO_API_SECRET;
      const originalApp = process.env.TWILIO_TWIML_APP_SID;

      delete process.env.TWILIO_API_KEY;
      delete process.env.TWILIO_API_SECRET;
      delete process.env.TWILIO_TWIML_APP_SID;

      expect(() => generateClientToken('test-user')).toThrow('Twilio Client not configured');

      if (originalKey) process.env.TWILIO_API_KEY = originalKey;
      if (originalSecret) process.env.TWILIO_API_SECRET = originalSecret;
      if (originalApp) process.env.TWILIO_TWIML_APP_SID = originalApp;
    });
  });

  describe('Call log CRUD', () => {
    it('inserts a call_log row and reads it back', async () => {
      await insertTestProperty();

      const [row] = await db
        .insert(callLogs)
        .values({
          callSid: 'CA_test_123',
          dominionLeadId: TEST_PROPERTY_ID,
          userId: 'agent-1',
          direction: 'OUTBOUND',
          toPhone: '5095550123',
          fromPhone: '5095550001',
          status: 'initiated',
        })
        .returning();

      expect(row.callSid).toBe('CA_test_123');
      expect(row.dominionLeadId).toBe(TEST_PROPERTY_ID);
      expect(row.status).toBe('initiated');
      expect(row.durationSeconds).toBeNull();
    });

    it('updates call status to completed with duration', async () => {
      await insertTestProperty();

      await db.insert(callLogs).values({
        callSid: 'CA_test_456',
        dominionLeadId: TEST_PROPERTY_ID,
        userId: 'agent-1',
        direction: 'OUTBOUND',
        toPhone: '5095550123',
        fromPhone: '5095550001',
        status: 'initiated',
      });

      await db
        .update(callLogs)
        .set({
          status: 'completed',
          durationSeconds: 45,
          endedAt: new Date(),
        })
        .where(eq(callLogs.callSid, 'CA_test_456'));

      const [updated] = await db
        .select()
        .from(callLogs)
        .where(eq(callLogs.callSid, 'CA_test_456'));

      expect(updated.status).toBe('completed');
      expect(updated.durationSeconds).toBe(45);
      expect(updated.endedAt).not.toBeNull();
    });

    it('enforces unique callSid constraint', async () => {
      await insertTestProperty();

      await db.insert(callLogs).values({
        callSid: 'CA_unique_test',
        dominionLeadId: TEST_PROPERTY_ID,
        userId: 'agent-1',
        direction: 'OUTBOUND',
        toPhone: '5095550123',
        fromPhone: '5095550001',
        status: 'initiated',
      });

      await expect(
        db.insert(callLogs).values({
          callSid: 'CA_unique_test',
          dominionLeadId: TEST_PROPERTY_ID,
          userId: 'agent-2',
          direction: 'OUTBOUND',
          toPhone: '5095550123',
          fromPhone: '5095550001',
          status: 'initiated',
        }),
      ).rejects.toThrow();
    });
  });

  describe('SMS log CRUD', () => {
    it('inserts an sms_log row and reads it back', async () => {
      const [row] = await db
        .insert(smsLogs)
        .values({
          messageSid: 'SM_test_789',
          dominionLeadId: TEST_PROPERTY_ID,
          userId: 'agent-1',
          direction: 'OUTBOUND',
          toPhone: '5095550123',
          fromPhone: '5095550001',
          body: 'Test message body',
          status: 'queued',
        })
        .returning();

      expect(row.messageSid).toBe('SM_test_789');
      expect(row.body).toBe('Test message body');
      expect(row.status).toBe('queued');
    });

    it('updates SMS status to delivered', async () => {
      await db.insert(smsLogs).values({
        messageSid: 'SM_delivery_test',
        direction: 'OUTBOUND',
        toPhone: '5095550123',
        fromPhone: '5095550001',
        body: 'Delivery test',
        status: 'queued',
      });

      await db
        .update(smsLogs)
        .set({ status: 'delivered' })
        .where(eq(smsLogs.messageSid, 'SM_delivery_test'));

      const [updated] = await db
        .select()
        .from(smsLogs)
        .where(eq(smsLogs.messageSid, 'SM_delivery_test'));

      expect(updated.status).toBe('delivered');
    });
  });

  describe('Activity log integration', () => {
    it('logs CALL_PLACED activity with call metadata', async () => {
      await insertTestProperty();

      await db.insert(activityLog).values({
        dominionLeadId: TEST_PROPERTY_ID,
        activityType: 'CALL_PLACED',
        channel: 'OUTBOUND_COLD',
        outcome: 'NO_ANSWER',
        meta: {
          callSid: 'CA_activity_test',
          durationSeconds: 0,
          toPhone: '5095550123',
        },
      });

      const [entry] = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.dominionLeadId, TEST_PROPERTY_ID));

      expect(entry.activityType).toBe('CALL_PLACED');
      expect(entry.channel).toBe('OUTBOUND_COLD');
      expect(entry.outcome).toBe('NO_ANSWER');
      expect((entry.meta as Record<string, unknown>).callSid).toBe('CA_activity_test');
    });

    it('logs TEXT_SENT activity with SMS metadata', async () => {
      await insertTestProperty();

      await db.insert(activityLog).values({
        dominionLeadId: TEST_PROPERTY_ID,
        activityType: 'TEXT_SENT',
        channel: 'MANUAL_SMS',
        meta: {
          messageSid: 'SM_activity_test',
          toPhone: '5095550123',
          bodyPreview: 'Hello there',
        },
      });

      const [entry] = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.dominionLeadId, TEST_PROPERTY_ID));

      expect(entry.activityType).toBe('TEXT_SENT');
      expect(entry.channel).toBe('MANUAL_SMS');
    });
  });

  describe('Inbound SMS matching', () => {
    it('matches inbound SMS to a property by phone number', async () => {
      await insertTestProperty('5095550199');

      const normalizedPhone = '5095550199';

      const [match] = await db
        .select({ dominionLeadId: properties.dominionLeadId })
        .from(properties)
        .where(
          sql`REPLACE(REPLACE(REPLACE(REPLACE(${properties.phone}, '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${'%' + normalizedPhone}`,
        )
        .limit(1);

      expect(match).toBeDefined();
      expect(match.dominionLeadId).toBe(TEST_PROPERTY_ID);
    });
  });

  describe('Conversation messages', () => {
    it('returns both call and SMS logs for a lead in chronological order', async () => {
      await insertTestProperty();

      await db.insert(callLogs).values({
        callSid: 'CA_conv_1',
        dominionLeadId: TEST_PROPERTY_ID,
        userId: 'agent-1',
        direction: 'OUTBOUND',
        toPhone: '5095550123',
        fromPhone: '5095550001',
        status: 'completed',
        startedAt: new Date('2026-02-20T10:00:00Z'),
      });

      await db.insert(smsLogs).values({
        messageSid: 'SM_conv_1',
        dominionLeadId: TEST_PROPERTY_ID,
        userId: 'agent-1',
        direction: 'OUTBOUND',
        toPhone: '5095550123',
        fromPhone: '5095550001',
        body: 'Follow-up text',
        status: 'delivered',
        createdAt: new Date('2026-02-20T11:00:00Z'),
      });

      await db.insert(smsLogs).values({
        messageSid: 'SM_conv_2',
        dominionLeadId: TEST_PROPERTY_ID,
        direction: 'INBOUND',
        toPhone: '5095550001',
        fromPhone: '5095550123',
        body: 'Owner reply',
        status: 'received',
        createdAt: new Date('2026-02-20T12:00:00Z'),
      });

      const calls = await db
        .select()
        .from(callLogs)
        .where(eq(callLogs.dominionLeadId, TEST_PROPERTY_ID));

      const sms = await db
        .select()
        .from(smsLogs)
        .where(eq(smsLogs.dominionLeadId, TEST_PROPERTY_ID));

      const messages = [
        ...calls.map(c => ({ type: 'call', timestamp: c.startedAt })),
        ...sms.map(s => ({ type: 'sms', timestamp: s.createdAt })),
      ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      expect(messages).toHaveLength(3);
      expect(messages[0].type).toBe('call');
      expect(messages[1].type).toBe('sms');
      expect(messages[2].type).toBe('sms');
    });
  });
});
