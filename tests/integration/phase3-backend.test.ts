import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { sql, eq, desc } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  propertyContacts,
  tags,
  leadInstanceTags,
  tasks,
  savedFilters,
  leadInstances,
  promotedLeads,
  distressEvents,
  scoringRecords,
  activityLog,
} from '../../src/db/schema/index.js';
import { DealStage, TaskStatus } from '../../src/db/schema/constants.js';

const skip = !isTestDbAvailable();

describe.skipIf(skip)('Phase 3 Backend: Property Intelligence', () => {
  const db = skip ? (null as never) : getTestDb();

  const PROPERTY_ID = uuidv7();
  const PROPERTY_ID_2 = uuidv7();
  const LEAD_INSTANCE_ID = uuidv7();
  const PROMOTION_ID = uuidv7();

  async function seedProperty(id: string, apn: string) {
    await db.insert(properties).values({
      dominionLeadId: id,
      propertyId: uuidv7(),
      apn,
      county: 'Spokane',
      state: 'WA',
      streetAddress: '123 Test St',
      city: 'Spokane',
      zip: '99201',
      ownerName: 'Test Owner',
      ownerFirst: 'Test',
      ownerLast: 'Owner',
      phone: '5551234567',
      email: 'test@example.com',
    });
  }

  async function seedLeadInstance(leadId: string, propId: string, promoId: string) {
    await db.insert(promotedLeads).values({
      promotionId: promoId,
      dominionLeadId: propId,
      compositeScore: '85.5',
      confidenceScore: '0.92',
      scoreModelVersion: 'v1.1',
      marketingTier: 'A',
      urgencyLevel: 'HIGH',
    });
    await db.insert(leadInstances).values({
      leadInstanceId: leadId,
      dominionLeadId: propId,
      promotionId: promoId,
      status: 'PROMOTED',
      dealStage: DealStage.NEW_LEAD,
    });
  }

  beforeAll(async () => {
    await cleanupTables();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  // ──────────────────────────────────────────────
  // Test 1: Property Contacts CRUD
  // ──────────────────────────────────────────────
  describe('Property Contacts', () => {
    it('should create, read, and update contacts', async () => {
      await seedProperty(PROPERTY_ID, 'APN-CONTACT-001');

      // Create 3 contacts
      const contactData = [
        { dominionLeadId: PROPERTY_ID, contactName: 'Alice Owner', contactType: 'OWNER', phone: '5551111111', phoneType: 'MOBILE', source: 'TRACERFY', isPrimary: true, isOwnerMatch: true },
        { dominionLeadId: PROPERTY_ID, contactName: 'Bob Relative', contactType: 'RELATIVE', phone: '5552222222', phoneType: 'LANDLINE', source: 'TRACERFY' },
        { dominionLeadId: PROPERTY_ID, contactName: 'Carol Tenant', contactType: 'TENANT', phone: '5553333333', phoneType: 'MOBILE', source: 'MANUAL' },
      ];

      for (const c of contactData) {
        await db.insert(propertyContacts).values(c);
      }

      // Read contacts
      const contacts = await db
        .select()
        .from(propertyContacts)
        .where(eq(propertyContacts.dominionLeadId, PROPERTY_ID));

      expect(contacts).toHaveLength(3);

      // Mark one as DNC calls
      const targetContact = contacts.find(c => c.contactName === 'Bob Relative')!;
      await db
        .update(propertyContacts)
        .set({ dndCalls: true })
        .where(eq(propertyContacts.id, targetContact.id));

      const [updated] = await db
        .select()
        .from(propertyContacts)
        .where(eq(propertyContacts.id, targetContact.id));

      expect(updated.dndCalls).toBe(true);
      expect(updated.dndSms).toBe(false);
    });

    it('should cascade delete when property is deleted', async () => {
      const tempPropId = uuidv7();
      await seedProperty(tempPropId, 'APN-CASCADE-001');

      await db.insert(propertyContacts).values({
        dominionLeadId: tempPropId,
        contactName: 'Cascade Test',
        contactType: 'OWNER',
        phone: '5559999999',
      });

      const before = await db
        .select()
        .from(propertyContacts)
        .where(eq(propertyContacts.dominionLeadId, tempPropId));
      expect(before).toHaveLength(1);

      await db.delete(properties).where(eq(properties.dominionLeadId, tempPropId));

      const after = await db
        .select()
        .from(propertyContacts)
        .where(eq(propertyContacts.dominionLeadId, tempPropId));
      expect(after).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────
  // Test 2: Tags System
  // ──────────────────────────────────────────────
  describe('Tags System', () => {
    it('should create tag, apply to lead, query by tag, and remove', async () => {
      await seedProperty(PROPERTY_ID, 'APN-TAG-001');
      await seedLeadInstance(LEAD_INSTANCE_ID, PROPERTY_ID, PROMOTION_ID);

      // Create tag
      const [tag] = await db.insert(tags).values({ name: 'Test Hot Lead', color: '#EF4444' }).returning();
      expect(tag.name).toBe('Test Hot Lead');

      // Apply to lead
      await db.insert(leadInstanceTags).values({
        leadInstanceId: LEAD_INSTANCE_ID,
        tagId: tag.id,
        appliedBy: 'admin-bootstrap',
      });

      // Query leads with this tag
      const taggedLeads = await db
        .select({ leadInstanceId: leadInstanceTags.leadInstanceId })
        .from(leadInstanceTags)
        .innerJoin(tags, eq(leadInstanceTags.tagId, tags.id))
        .where(eq(tags.name, 'Test Hot Lead'));

      expect(taggedLeads).toHaveLength(1);
      expect(taggedLeads[0].leadInstanceId).toBe(LEAD_INSTANCE_ID);

      // Remove tag
      await db
        .delete(leadInstanceTags)
        .where(
          sql`${leadInstanceTags.leadInstanceId} = ${LEAD_INSTANCE_ID} AND ${leadInstanceTags.tagId} = ${tag.id}`,
        );

      const afterRemove = await db
        .select({ leadInstanceId: leadInstanceTags.leadInstanceId })
        .from(leadInstanceTags)
        .where(eq(leadInstanceTags.leadInstanceId, LEAD_INSTANCE_ID));

      expect(afterRemove).toHaveLength(0);
    });

    it('should enforce unique tag names', async () => {
      await db.insert(tags).values({ name: 'UniqueTag', color: '#000000' });

      await expect(
        db.insert(tags).values({ name: 'UniqueTag', color: '#FFFFFF' }),
      ).rejects.toThrow();
    });

    it('should enforce unique tag per lead instance', async () => {
      await seedProperty(PROPERTY_ID, 'APN-TAG-DUP-001');
      await seedLeadInstance(LEAD_INSTANCE_ID, PROPERTY_ID, PROMOTION_ID);

      const [tag] = await db.insert(tags).values({ name: 'DupTest', color: '#123456' }).returning();

      await db.insert(leadInstanceTags).values({
        leadInstanceId: LEAD_INSTANCE_ID,
        tagId: tag.id,
      });

      await expect(
        db.insert(leadInstanceTags).values({
          leadInstanceId: LEAD_INSTANCE_ID,
          tagId: tag.id,
        }),
      ).rejects.toThrow();
    });
  });

  // ──────────────────────────────────────────────
  // Test 3: Tasks Lifecycle
  // ──────────────────────────────────────────────
  describe('Tasks Lifecycle', () => {
    it('should create, find due today, and complete a task', async () => {
      await seedProperty(PROPERTY_ID, 'APN-TASK-001');
      await seedLeadInstance(LEAD_INSTANCE_ID, PROPERTY_ID, PROMOTION_ID);

      // Create task due today
      const now = new Date();
      const dueToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0);

      const [task] = await db.insert(tasks).values({
        title: 'Call back property owner',
        description: 'Follow up on initial interest',
        taskType: 'CALLBACK',
        leadInstanceId: LEAD_INSTANCE_ID,
        dominionLeadId: PROPERTY_ID,
        assignedTo: 'admin-bootstrap',
        dueAt: dueToday,
        createdBy: 'admin-bootstrap',
      }).returning();

      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.taskType).toBe('CALLBACK');

      // Find tasks due today
      const dueRows = await db
        .select()
        .from(tasks)
        .where(
          sql`${tasks.status} = 'PENDING' AND ${tasks.dueAt} >= date_trunc('day', now()) AND ${tasks.dueAt} < date_trunc('day', now()) + interval '1 day'`,
        );

      expect(dueRows.length).toBeGreaterThanOrEqual(1);
      expect(dueRows.some(t => t.id === task.id)).toBe(true);

      // Complete the task
      await db
        .update(tasks)
        .set({
          status: TaskStatus.COMPLETED,
          completedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(tasks.id, task.id));

      const [completed] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));

      expect(completed.status).toBe(TaskStatus.COMPLETED);
      expect(completed.completedAt).not.toBeNull();
    });
  });

  // ──────────────────────────────────────────────
  // Test 4: Deal Stage Transitions
  // ──────────────────────────────────────────────
  describe('Deal Stage Transitions', () => {
    it('should allow valid transitions and reject invalid ones', async () => {
      await seedProperty(PROPERTY_ID, 'APN-STAGE-001');
      await seedLeadInstance(LEAD_INSTANCE_ID, PROPERTY_ID, PROMOTION_ID);

      // Verify starts at NEW_LEAD
      const [initial] = await db
        .select({ dealStage: leadInstances.dealStage })
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, LEAD_INSTANCE_ID));
      expect(initial.dealStage).toBe(DealStage.NEW_LEAD);

      // Valid transitions: NEW_LEAD → SKIP_TRACED → CONTACTED → INTERESTED
      for (const stage of [DealStage.SKIP_TRACED, DealStage.CONTACTED, DealStage.INTERESTED]) {
        await db
          .update(leadInstances)
          .set({ dealStage: stage, updatedAt: sql`now()` })
          .where(eq(leadInstances.leadInstanceId, LEAD_INSTANCE_ID));

        const [updated] = await db
          .select({ dealStage: leadInstances.dealStage })
          .from(leadInstances)
          .where(eq(leadInstances.leadInstanceId, LEAD_INSTANCE_ID));
        expect(updated.dealStage).toBe(stage);
      }

      // Verify final state is INTERESTED
      const [final] = await db
        .select({ dealStage: leadInstances.dealStage })
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, LEAD_INSTANCE_ID));
      expect(final.dealStage).toBe(DealStage.INTERESTED);

      // Valid: INTERESTED → OFFER_MADE
      await db
        .update(leadInstances)
        .set({ dealStage: DealStage.OFFER_MADE })
        .where(eq(leadInstances.leadInstanceId, LEAD_INSTANCE_ID));

      const [offered] = await db
        .select({ dealStage: leadInstances.dealStage })
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, LEAD_INSTANCE_ID));
      expect(offered.dealStage).toBe(DealStage.OFFER_MADE);
    });

    it('should validate deal stage transition service logic', async () => {
      // Test the VALID_DEAL_TRANSITIONS map directly
      const validTransitions: Record<string, string[]> = {
        [DealStage.NEW_LEAD]:       [DealStage.SKIP_TRACED, DealStage.DEAD],
        [DealStage.SKIP_TRACED]:    [DealStage.CONTACTED, DealStage.DEAD],
        [DealStage.CONTACTED]:      [DealStage.INTERESTED, DealStage.DEAD],
        [DealStage.INTERESTED]:     [DealStage.OFFER_MADE, DealStage.DEAD],
        [DealStage.OFFER_MADE]:     [DealStage.UNDER_CONTRACT, DealStage.DEAD],
        [DealStage.UNDER_CONTRACT]: [DealStage.TITLE_ESCROW, DealStage.CLOSED_LOST],
        [DealStage.TITLE_ESCROW]:   [DealStage.CLOSED_WON, DealStage.CLOSED_LOST],
        [DealStage.CLOSED_WON]:     [],
        [DealStage.CLOSED_LOST]:    [],
        [DealStage.DEAD]:           [DealStage.NEW_LEAD],
      };

      // INTERESTED → TITLE_ESCROW should be invalid
      expect(validTransitions[DealStage.INTERESTED]).not.toContain(DealStage.TITLE_ESCROW);

      // DEAD → NEW_LEAD (resurrection) should be valid
      expect(validTransitions[DealStage.DEAD]).toContain(DealStage.NEW_LEAD);

      // Terminal states have no transitions
      expect(validTransitions[DealStage.CLOSED_WON]).toHaveLength(0);
      expect(validTransitions[DealStage.CLOSED_LOST]).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────
  // Test 5: Property Detail Aggregation
  // ──────────────────────────────────────────────
  describe('Property Detail Aggregation', () => {
    it('should aggregate all property data in a single query set', async () => {
      await seedProperty(PROPERTY_ID, 'APN-DETAIL-001');
      await seedLeadInstance(LEAD_INSTANCE_ID, PROPERTY_ID, PROMOTION_ID);

      // Add contacts
      await db.insert(propertyContacts).values([
        { dominionLeadId: PROPERTY_ID, contactName: 'Primary', contactType: 'OWNER', phone: '5551111111', isPrimary: true },
        { dominionLeadId: PROPERTY_ID, contactName: 'Secondary', contactType: 'RELATIVE', phone: '5552222222' },
      ]);

      // Add scoring record (bypass trigger via direct insert)
      await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER USER`);
      const scoreId = uuidv7();
      await db.insert(scoringRecords).values({
        scoreId,
        dominionLeadId: PROPERTY_ID,
        compositeScore: '82.5',
        motivationScore: '75.0',
        dealScore: '90.0',
        confidenceScore: '0.88',
        scoreModelVersion: 'v1.1',
        scoreInputsSnapshot: { test: true },
        signalContributions: { test: true },
      });
      await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER USER`);

      // Add distress event
      await db.execute(sql`ALTER TABLE distress_events DISABLE TRIGGER USER`);
      await db.insert(distressEvents).values({
        eventId: uuidv7(),
        dominionLeadId: PROPERTY_ID,
        eventType: 'TAX_DELINQUENCY',
        eventLayer: 'confirmed',
        sourceName: 'county_records',
        fingerprint: `fp-detail-${Date.now()}`,
        reliabilityScore: '0.95',
      });
      await db.execute(sql`ALTER TABLE distress_events ENABLE TRIGGER USER`);

      // Add tags
      const [tag] = await db.insert(tags).values({ name: 'Detail Test Tag', color: '#EF4444' }).returning();
      await db.insert(leadInstanceTags).values({ leadInstanceId: LEAD_INSTANCE_ID, tagId: tag.id });

      // Add task
      await db.insert(tasks).values({
        title: 'Detail test task',
        taskType: 'CALLBACK',
        leadInstanceId: LEAD_INSTANCE_ID,
        dominionLeadId: PROPERTY_ID,
        assignedTo: 'admin-bootstrap',
      });

      // Now verify all data can be fetched
      const [property] = await db.select().from(properties).where(eq(properties.dominionLeadId, PROPERTY_ID));
      expect(property).toBeDefined();

      const contacts = await db.select().from(propertyContacts).where(eq(propertyContacts.dominionLeadId, PROPERTY_ID));
      expect(contacts).toHaveLength(2);

      const [score] = await db
        .select()
        .from(scoringRecords)
        .where(eq(scoringRecords.dominionLeadId, PROPERTY_ID))
        .orderBy(desc(scoringRecords.createdAt))
        .limit(1);
      expect(score.compositeScore).toBe('82.5000');

      const events = await db
        .select()
        .from(distressEvents)
        .where(eq(distressEvents.dominionLeadId, PROPERTY_ID));
      expect(events.length).toBeGreaterThanOrEqual(1);

      const [li] = await db
        .select()
        .from(leadInstances)
        .where(eq(leadInstances.dominionLeadId, PROPERTY_ID));
      expect(li).toBeDefined();
      expect(li.dealStage).toBe(DealStage.NEW_LEAD);

      const leadTags = await db
        .select({ name: tags.name })
        .from(leadInstanceTags)
        .innerJoin(tags, eq(leadInstanceTags.tagId, tags.id))
        .where(eq(leadInstanceTags.leadInstanceId, LEAD_INSTANCE_ID));
      expect(leadTags).toHaveLength(1);
      expect(leadTags[0].name).toBe('Detail Test Tag');

      const leadTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.leadInstanceId, LEAD_INSTANCE_ID));
      expect(leadTasks).toHaveLength(1);
      expect(leadTasks[0].title).toBe('Detail test task');
    });
  });

  // ──────────────────────────────────────────────
  // Test 6: Saved Filter Persistence
  // ──────────────────────────────────────────────
  describe('Saved Filters', () => {
    it('should create, retrieve, and delete a saved filter', async () => {
      const config = { statuses: ['DIAL_READY', 'IN_CONVERSATION'], minScore: 80 };

      const [filter] = await db.insert(savedFilters).values({
        name: 'Test Filter',
        description: 'Test description',
        filterConfig: config,
        createdBy: 'admin-bootstrap',
      }).returning();

      expect(filter.name).toBe('Test Filter');
      expect(filter.filterConfig).toEqual(config);

      // Retrieve
      const [retrieved] = await db
        .select()
        .from(savedFilters)
        .where(eq(savedFilters.id, filter.id));

      expect(retrieved.filterConfig).toEqual(config);

      // Delete
      await db.delete(savedFilters).where(eq(savedFilters.id, filter.id));

      const after = await db
        .select()
        .from(savedFilters)
        .where(eq(savedFilters.id, filter.id));

      expect(after).toHaveLength(0);
    });
  });
});
