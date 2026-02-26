import type { TaskTypeValue } from '../../db/schema/constants.js';

export interface NurtureCadenceStep {
  stepNumber: number;
  delayDays: number;            // days from nurture entry
  taskType: TaskTypeValue;
  title: string;
  description: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  channel: 'MAIL' | 'EMAIL' | 'SMS' | 'CALL';
  templateKey?: string;         // for future template system
}

/**
 * DOMINION RANGER — 12-Month Nurture Cadence
 *
 * Multi-channel drip campaign for motivated seller leads.
 * Research-backed timing and channel mix optimized for wholesaling.
 *
 * Rhythm:
 *   - Direct mail:    Every ~30 days (12 touches/year)
 *   - Email:          Every ~14 days (26 touches/year)
 *   - SMS:            Strategic amplifiers (~12 touches/year)
 *   - Follow-up call: Every ~45-60 days, timed after mailer (8 touches/year)
 *
 * Total: ~58 touches/year across 4 channels
 * Max gap between any touchpoint: 14 days
 */
export const NURTURE_CADENCE_STEPS: NurtureCadenceStep[] = [

  // ═══════════════════════════════════════════════════════════
  // MONTH 1 — Re-engagement (they just left active pipeline)
  // Goal: Stay warm, acknowledge their timeline, no pressure
  // ═══════════════════════════════════════════════════════════

  {
    stepNumber: 1,
    delayDays: 1,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #1 — Soft check-in',
    description: 'Friendly text: "Hi [Name], this is [Agent] with Dominion. Just wanted to let you know — if your situation changes with [Address], we\'re still interested. No rush, no pressure. Have a great day!"',
    priority: 'HIGH',
    channel: 'SMS',
    templateKey: 'nurture_sms_checkin_1',
  },
  {
    stepNumber: 2,
    delayDays: 7,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #1 — Market update intro',
    description: 'Email with local market snapshot: recent sales in their area, average prices, days on market. Position as helpful info, not a sales pitch. Subject: "Quick market update for [Neighborhood]"',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_market_update_1',
  },
  {
    stepNumber: 3,
    delayDays: 14,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #1 — Personalized postcard',
    description: 'Postcard referencing their property address. Personal photo, conversational tone: "Hi [Name], I reached out about [Address] a while back. Whenever you\'re ready, I\'d love to chat. — [Agent]" Include phone, text, and email contact options.',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_postcard_1',
  },
  {
    stepNumber: 4,
    delayDays: 21,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #2 — Value content (selling tips)',
    description: 'Email: "3 things to know before selling your home in [County]." Educational content about selling process, timeline, costs. No hard sell — build trust and authority.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_selling_tips',
  },
  {
    stepNumber: 5,
    delayDays: 28,
    taskType: 'NURTURE_CALL',
    title: 'Nurture Call #1 — Reference the postcard',
    description: 'Call to reference Mailer #1: "Hey [Name], I sent you a postcard a couple weeks ago about [Address]. Just checking in — has anything changed with the property?" Keep casual. If VM, leave a short friendly message and move to next step.',
    priority: 'HIGH',
    channel: 'CALL',
  },

  // ═══════════════════════════════════════════════════════════
  // MONTH 2 — Build trust & credibility
  // Goal: Establish yourself as the local expert they know
  // ═══════════════════════════════════════════════════════════

  {
    stepNumber: 6,
    delayDays: 35,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #3 — Neighborhood sold report',
    description: 'Email showing recent cash sales and closings in their neighborhood. "Your neighbor at [nearby address] just sold for $X — here\'s what that means for your property value." Data-driven, builds FOMO.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_neighborhood_sold',
  },
  {
    stepNumber: 7,
    delayDays: 42,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #2 — Quick value touch',
    description: 'Text: "Hi [Name], quick heads up — home values in [ZIP] are up [X]% this year. If you ever want a no-obligation cash offer on [Address], I\'m just a text away. — [Agent]"',
    priority: 'NORMAL',
    channel: 'SMS',
    templateKey: 'nurture_sms_value_touch',
  },
  {
    stepNumber: 8,
    delayDays: 45,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #2 — Handwritten-style letter',
    description: 'Letter (handwritten font or actual handwritten via service). More personal than postcard. Reference their situation if known. "I know selling is a big decision. When the time is right, I can make it simple — cash offer, you pick the closing date, no repairs needed."',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_letter_1',
  },
  {
    stepNumber: 9,
    delayDays: 49,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #4 — Testimonial / case study',
    description: 'Email featuring a real success story: "How we helped [Seller] close in 14 days with zero repairs." Social proof builds trust. Include a soft CTA: "Want to see what we could offer for your property?"',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_testimonial',
  },
  {
    stepNumber: 10,
    delayDays: 56,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #3 — Post-mailer amplifier',
    description: 'Text: "Hi [Name], I sent you a letter recently about [Address]. Just making sure you got it! Let me know if you have any questions. — [Agent]"',
    priority: 'NORMAL',
    channel: 'SMS',
    templateKey: 'nurture_sms_mailer_amplifier_1',
  },

  // ═══════════════════════════════════════════════════════════
  // MONTH 3 — Deepen engagement
  // Goal: Multiple touchpoints proven to break through. By now
  // they've seen you 10 times across 4 channels.
  // ═══════════════════════════════════════════════════════════

  {
    stepNumber: 11,
    delayDays: 63,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #5 — Market conditions update',
    description: 'Email: seasonal market update. "Spring/Summer/Fall/Winter market outlook for [County]." Position timing advantages: "Selling now means..." or "Waiting could mean..." Factual, not pushy.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_seasonal_update',
  },
  {
    stepNumber: 12,
    delayDays: 75,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #3 — "We buy houses" branded postcard',
    description: 'Branded postcard with clear value prop: "We buy houses in ANY condition. Cash offer in 24 hours. Close in as little as 7 days. No repairs, no fees, no hassle." Include QR code linking to offer request page.',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_branded_postcard',
  },
  {
    stepNumber: 13,
    delayDays: 77,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #6 — FAQ / objection handling',
    description: 'Email: "5 questions sellers always ask us." Address common objections: Is this a scam? Will I get a fair price? What about my mortgage? How fast can you close? What if my house needs work? Builds trust through transparency.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_faq',
  },
  {
    stepNumber: 14,
    delayDays: 84,
    taskType: 'NURTURE_CALL',
    title: 'Nurture Call #2 — Check-in after 3 months',
    description: 'Call: "Hi [Name], it\'s [Agent]. I\'ve been keeping an eye on [Address] — just wanted to check in and see if anything has changed. Even if selling is still down the road, I\'m happy to answer any questions." If no answer, leave a brief VM referencing the recent mailer.',
    priority: 'HIGH',
    channel: 'CALL',
  },
  {
    stepNumber: 15,
    delayDays: 90,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #4 — Simple pulse check',
    description: 'Text: "Hey [Name], just a quick check-in on [Address]. Any changes? I\'m around if you want to chat. — [Agent]"',
    priority: 'NORMAL',
    channel: 'SMS',
    templateKey: 'nurture_sms_pulse_check',
  },

  // ═══════════════════════════════════════════════════════════
  // MONTHS 4-6 — Consistent presence
  // Goal: You are now "their guy" — the person they think of
  // when they're ready. Maintain rhythm without fatigue.
  // ═══════════════════════════════════════════════════════════

  // Month 4
  {
    stepNumber: 16,
    delayDays: 98,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #7 — Local market data',
    description: 'Email with fresh comp data for their area. "Homes near [Address] are selling for $X-$Y. Here\'s what that could mean for you." Data-driven credibility.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_comp_data',
  },
  {
    stepNumber: 17,
    delayDays: 105,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #4 — Different format (yellow letter)',
    description: 'Handwritten yellow letter — proven highest response rate format in RE investing. Short, personal: "Hi [Name], I\'m still interested in [Address]. If you\'ve thought about selling, I\'d love to talk. Call or text me anytime. — [Agent]"',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_yellow_letter',
  },
  {
    stepNumber: 18,
    delayDays: 112,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #8 — Process explainer',
    description: 'Email: "Here\'s exactly how selling to us works (step by step)." Walk through: 1) We look at your property info, 2) We make a cash offer within 24h, 3) You pick the closing date, 4) We handle everything. Demystify the process.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_process_explainer',
  },
  {
    stepNumber: 19,
    delayDays: 120,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #5 — Post-mailer amplifier',
    description: 'Text: "Hi [Name], did you get my letter about [Address]? I\'d love to make you a no-obligation offer whenever you\'re ready. — [Agent]"',
    priority: 'NORMAL',
    channel: 'SMS',
    templateKey: 'nurture_sms_mailer_amplifier_2',
  },

  // Month 5
  {
    stepNumber: 20,
    delayDays: 126,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #9 — Second testimonial',
    description: 'Email: another success story, different scenario. "How [Seller] avoided foreclosure by selling to us in 10 days." Match to common distress signals in your nurture pool.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_testimonial_2',
  },
  {
    stepNumber: 21,
    delayDays: 135,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #5 — Sealed check / curiosity piece',
    description: 'High-impact format: sealed check mailer or "What\'s your home worth?" curiosity postcard. These get opened at very high rates. Include estimated value range for their property.',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_curiosity',
  },
  {
    stepNumber: 22,
    delayDays: 140,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #10 — "Did you know" value piece',
    description: 'Email: "Did you know you can sell your house without listing it?" Educate on off-market sales benefits: no showings, no agent commissions, no repairs, fast closing. Plant the seed.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_did_you_know',
  },
  {
    stepNumber: 23,
    delayDays: 150,
    taskType: 'NURTURE_CALL',
    title: 'Nurture Call #3 — 5 month check-in',
    description: 'Call: "Hi [Name], it\'s been a few months since we last spoke. I\'m still buying properties in [area] and [Address] caught my eye again. Any updates on your end?" Reference the sealed check/curiosity mailer if sent.',
    priority: 'HIGH',
    channel: 'CALL',
  },

  // Month 6
  {
    stepNumber: 24,
    delayDays: 154,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #11 — Tax implications content',
    description: 'Email: "Thinking about selling? Here\'s what to know about taxes." Cover capital gains basics, 1031 exchanges, selling inherited property. Educational authority content.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_tax_info',
  },
  {
    stepNumber: 25,
    delayDays: 165,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #6 — Postcard with recent purchase',
    description: 'Postcard: "We just bought a home near you!" Show a recent purchase (with permission) in their area. Social proof + urgency: "We\'re actively buying in [neighborhood]. Interested in an offer for [Address]?"',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_recent_purchase',
  },
  {
    stepNumber: 26,
    delayDays: 168,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #12 — Midpoint value refresh',
    description: 'Email: updated market snapshot. "Here\'s what changed in [County] real estate in the last 6 months." Show trends that favor selling. Factual, data-driven.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_midpoint_update',
  },
  {
    stepNumber: 27,
    delayDays: 175,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #6 — Midpoint pulse',
    description: 'Text: "Hi [Name], we just closed on a property near [Address]. Still interested in yours if you\'re ever thinking about selling! — [Agent]"',
    priority: 'NORMAL',
    channel: 'SMS',
    templateKey: 'nurture_sms_social_proof',
  },
  {
    stepNumber: 28,
    delayDays: 180,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #13 — "Still here" relationship touch',
    description: 'Email: short, personal. "Hi [Name], just a quick note to say I\'m still here whenever you need me. No pressure — I just want you to know you have options when it comes to [Address]. — [Agent]"',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_still_here',
  },

  // ═══════════════════════════════════════════════════════════
  // MONTHS 7-9 — Persistent presence, rotating content
  // Goal: Many sellers convert at 6-9 months. Stay in their
  // world. Rotate formats to avoid "pattern blindness."
  // ═══════════════════════════════════════════════════════════

  // Month 7
  {
    stepNumber: 29,
    delayDays: 195,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #7 — Letter with handwritten note',
    description: 'Full letter with a handwritten P.S. note. "P.S. — I drove by [Address] last week. Beautiful property. I\'d love to make it work if you\'re ever ready." Personal touch breaks through.',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_ps_letter',
  },
  {
    stepNumber: 30,
    delayDays: 196,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #14 — Market shift alert',
    description: 'Email: "Interest rates just changed — what it means for sellers in [County]." Timely content tied to real market events. Shows you\'re plugged in and watching.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_rate_alert',
  },
  {
    stepNumber: 31,
    delayDays: 203,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #7 — Mailer follow-up',
    description: 'Text: "Hey [Name], sent you something in the mail about [Address]. Let me know if you have any questions! — [Agent]"',
    priority: 'NORMAL',
    channel: 'SMS',
    templateKey: 'nurture_sms_mailer_amplifier_3',
  },
  {
    stepNumber: 32,
    delayDays: 210,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #15 — Third testimonial (different scenario)',
    description: 'Email: success story matching a different seller profile. Absentee owner, inherited property, tired landlord — rotate through common nurture lead types.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_testimonial_3',
  },
  {
    stepNumber: 33,
    delayDays: 215,
    taskType: 'NURTURE_CALL',
    title: 'Nurture Call #4 — 7 month relationship call',
    description: 'Call: conversational, no pressure. "Hey [Name], it\'s [Agent]. I try to check in every couple months — any changes with [Address]? Even if not, no worries at all. Just wanted to touch base." Build genuine rapport.',
    priority: 'HIGH',
    channel: 'CALL',
  },

  // Month 8
  {
    stepNumber: 34,
    delayDays: 224,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #16 — Comparison: selling options',
    description: 'Email: "3 ways to sell your house — and which is fastest." Compare: listing with agent, FSBO, cash sale to investor. Honest pros/cons. Position cash sale as simplest option.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_selling_options',
  },
  {
    stepNumber: 35,
    delayDays: 225,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #8 — Branded postcard (different design)',
    description: 'New postcard design — different from Mailer #3. Fresh look prevents "I already saw this" disengagement. Same core message: cash offer, fast close, no hassle. New design, new photo.',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_branded_postcard_2',
  },
  {
    stepNumber: 36,
    delayDays: 238,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #17 — Neighborhood activity alert',
    description: 'Email: "3 properties near [Address] sold in the last 60 days." Show nearby activity. Creates urgency through FOMO — the market is moving around them.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_neighborhood_activity',
  },
  {
    stepNumber: 37,
    delayDays: 245,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #8 — Quick check-in',
    description: 'Text: "Hi [Name], any changes with [Address]? I\'m still buying in [area] and would love to chat whenever you\'re ready. — [Agent]"',
    priority: 'NORMAL',
    channel: 'SMS',
    templateKey: 'nurture_sms_quick_checkin',
  },

  // Month 9
  {
    stepNumber: 38,
    delayDays: 252,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #18 — Market forecast / year-end',
    description: 'Email: forward-looking market analysis. "What [County] real estate looks like heading into [next quarter/year]." Timing content: "If you\'re thinking about selling in the next 6 months, here\'s what to know."',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_forecast',
  },
  {
    stepNumber: 39,
    delayDays: 255,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #9 — Yellow letter #2',
    description: 'Second yellow letter — different wording. "Hi [Name], I know I\'ve reached out a few times. I just want you to know: there\'s no expiration on my offer. Whenever you\'re ready, I\'m here. — [Agent]" Persistent but respectful.',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_yellow_letter_2',
  },
  {
    stepNumber: 40,
    delayDays: 266,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #19 — Common situations content',
    description: 'Email: "Dealing with an inherited property? Here\'s what you need to know." Or rotate: behind on taxes, divorce, relocating, tired landlord. Match to the lead\'s known distress signals.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_situations',
  },
  {
    stepNumber: 41,
    delayDays: 270,
    taskType: 'NURTURE_CALL',
    title: 'Nurture Call #5 — 9 month check-in',
    description: 'Call: "Hey [Name], it\'s [Agent] again. I check in every few months — just want to make sure I\'m here if anything changes with [Address]. How are things going?" This is the touch where many 6-12 month sellers start to convert.',
    priority: 'HIGH',
    channel: 'CALL',
  },
  {
    stepNumber: 42,
    delayDays: 277,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #9 — Gentle persistence',
    description: 'Text: "Hey [Name], just reaching out again on [Address]. I promise I\'m not going anywhere 😄. Here whenever you\'re ready! — [Agent]"',
    priority: 'NORMAL',
    channel: 'SMS',
    templateKey: 'nurture_sms_persistence',
  },

  // ═══════════════════════════════════════════════════════════
  // MONTHS 10-12 — Close the loop
  // Goal: Final push. Many investors give up here — you don't.
  // Consistency this deep separates pros from amateurs.
  // ═══════════════════════════════════════════════════════════

  // Month 10
  {
    stepNumber: 43,
    delayDays: 280,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #20 — Updated comp data',
    description: 'Email: fresh comparable sales data. "Here\'s what homes like yours are selling for right now." Updated numbers show you\'re actively tracking their property.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_comp_refresh',
  },
  {
    stepNumber: 44,
    delayDays: 285,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #10 — "Still interested" postcard',
    description: 'Postcard: "Hi [Name], I first reached out about [Address] almost a year ago. I\'m still interested — and my offer still stands. Call or text me anytime. — [Agent]" Reference the longevity of your interest.',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_still_interested',
  },
  {
    stepNumber: 45,
    delayDays: 294,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #21 — Benefits of cash sale recap',
    description: 'Email: "Reminder: here\'s what a cash sale looks like for you." Recap benefits: no showings, no repairs, no commissions, fast close, you pick the date. Simple, clean, direct.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_cash_benefits_recap',
  },

  // Month 11
  {
    stepNumber: 46,
    delayDays: 308,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #22 — Year-in-review market data',
    description: 'Email: annual market review for their area. "How [County] real estate performed this year." Comprehensive data piece. Position as "your annual update from [Agent]."',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_annual_review',
  },
  {
    stepNumber: 47,
    delayDays: 315,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #11 — High-impact piece (sealed check or jumbo)',
    description: 'Premium format mailer. Sealed check with estimated offer range, or oversized jumbo postcard. This is the "big gun" — invest in the format. Highest open rate format for the end-of-cadence push.',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_premium',
  },
  {
    stepNumber: 48,
    delayDays: 322,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #23 — Fourth testimonial',
    description: 'Email: fresh testimonial. "Another happy seller in [County]." Show volume: "We\'ve helped [X] families sell their homes stress-free this year." Social proof at scale.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_testimonial_4',
  },
  {
    stepNumber: 49,
    delayDays: 330,
    taskType: 'NURTURE_CALL',
    title: 'Nurture Call #6 — 11 month call',
    description: 'Call: "Hi [Name], it\'s [Agent]. I\'ve been reaching out about [Address] for almost a year now. I want you to know — I\'m genuinely interested in this property and I\'m not going anywhere. When the time is right, I\'m your first call. Sound good?"',
    priority: 'HIGH',
    channel: 'CALL',
  },
  {
    stepNumber: 50,
    delayDays: 335,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #10 — Pre-close amplifier',
    description: 'Text: "Hey [Name], I just left you a voicemail about [Address]. Give me a call when you get a chance! — [Agent]"',
    priority: 'NORMAL',
    channel: 'SMS',
    templateKey: 'nurture_sms_vm_followup',
  },

  // Month 12
  {
    stepNumber: 51,
    delayDays: 336,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #24 — Appreciation note',
    description: 'Email: genuine appreciation. "Hi [Name], I\'ve enjoyed staying in touch this year. I hope the info I\'ve shared has been helpful. I\'ll keep you updated on the [County] market. And if [Address] ever becomes available — you know where to find me."',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_appreciation',
  },
  {
    stepNumber: 52,
    delayDays: 345,
    taskType: 'SEND_MAILER',
    title: 'Nurture Mailer #12 — Final year-one postcard',
    description: 'Postcard: "It\'s been one year since I first reached out about [Address]. I\'m still here, still interested, still ready to make you a fair cash offer. — [Agent]" Longevity = trust. Few investors persist this long.',
    priority: 'HIGH',
    channel: 'MAIL',
    templateKey: 'nurture_mailer_anniversary',
  },
  {
    stepNumber: 53,
    delayDays: 350,
    taskType: 'SEND_EMAIL',
    title: 'Nurture Email #25 — What\'s next / cadence renewal',
    description: 'Email: "I\'ll keep sending you market updates and checking in periodically. If you ever want me to stop, just reply STOP. Otherwise, I\'ll keep you in the loop. — [Agent]" Sets expectation for Year 2 cadence.',
    priority: 'NORMAL',
    channel: 'EMAIL',
    templateKey: 'nurture_email_whats_next',
  },
  {
    stepNumber: 54,
    delayDays: 358,
    taskType: 'SEND_SMS',
    title: 'Nurture SMS #11 — Year-end text',
    description: 'Text: "Happy [season/new year] [Name]! Still thinking about [Address] whenever you\'re ready. Here\'s to a great year! — [Agent]"',
    priority: 'LOW',
    channel: 'SMS',
    templateKey: 'nurture_sms_year_end',
  },
  {
    stepNumber: 55,
    delayDays: 365,
    taskType: 'NURTURE_CALL',
    title: 'Nurture Call #7 — Anniversary call + renewal decision',
    description: 'Call: "Hi [Name], can you believe it\'s been a year? I wanted to personally check in. Is [Address] something you\'re still thinking about down the road?" Based on response: (A) Reactivate to Leads if warm, (B) Restart Year 2 cadence if still cold but engaged, (C) Move to Dead if they ask to stop.',
    priority: 'HIGH',
    channel: 'CALL',
  },
];

/**
 * Year 2+ cadence: If the lead completes Year 1 without converting or
 * being moved to Dead, the system should auto-restart a reduced cadence:
 * - Mailer every 45 days (8/year instead of 12)
 * - Email every 21 days (17/year instead of 26)
 * - SMS every 60 days (6/year instead of 12)
 * - Call every 90 days (4/year instead of 8)
 *
 * Total Year 2+: ~35 touches/year (down from 58)
 *
 * Implementation: When the last step (55) is completed, if the lead is
 * still in nurture status, create a GENERAL task titled
 * "Nurture Year 1 Complete — Review [Address]" for the assigned user
 * to decide: restart cadence, reactivate, or archive.
 */
export const NURTURE_YEAR2_REDUCED = true;
