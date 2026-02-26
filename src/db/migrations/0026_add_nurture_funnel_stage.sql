-- Add 'nurture' to funnel_stage check constraint
-- Nurture is a post-funnel stage for drip/follow-up leads

ALTER TABLE lead_instances DROP CONSTRAINT IF EXISTS lead_instances_funnel_stage_check;

ALTER TABLE lead_instances ADD CONSTRAINT lead_instances_funnel_stage_check
  CHECK (funnel_stage IN ('prospect', 'lead', 'paid_lead', 'negotiation', 'disposition', 'declined', 'nurture'));
