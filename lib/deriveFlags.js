// Turns a GHL contact record into the answers/flags shape index.js's
// scoring engine expects. Shared by api/assessment.js (the webhook
// endpoint, runs on every survey submission) and api/staff/[id].js (the
// Recalculate action) so there is exactly one derivation path - see the
// full input audit that found this logic duplicated (or missing
// entirely) across call sites was itself the source of several dead
// inputs.

const { GHL_SURVEY_ANSWER_FIELD_IDS, GHL_CUSTOM_FIELD_IDS, getCustomFieldValue } = require('./ghl.js');

// Q21_Longterm_Focus's picklist options, mapped 1:1 onto the q21_* flags
// the class-scoring functions read. "I'm not particularly focused on
// long-term health" and "I'm unsure / I'd like advice" map to no flag.
// Note: q21_Mobility and q21_ActivityParticipation aren't read by any
// scoring function today (checked every line of calculateFoundationScore/
// calculateLiftScore/calculateHybridScore/calculateHyroxScore) — derived
// anyway so they're ready the moment something reads them.
const Q21_OPTION_TO_FLAG = {
  'Maintain/build strength & muscle': 'q21_Strength',
  'Cardiovascular fitness & heart health': 'q21_Cardiovascular',
  'Mobility & movement': 'q21_Mobility',
  'Balance & physical confidence': 'q21_Balance',
  'Remain active & independent as I get older': 'q21_Independence',
  'Healthy weight & body composition': 'q21_BodyComposition',
  'Continue enjoying hobbies, sport & activities': 'q21_ActivityParticipation',
  'Reduce future pain or injury risk': 'q21_InjuryPrevention',
};

// Q22_Current_Activities categorization — the client has delegated this
// categorization to us. Change this constant, not the derivation logic
// below, if the categorization should change.
const Q22_ACTIVITY_CATEGORIES = {
  STRENGTH: ['Strength/weights'],
  CARDIO: ['Running', 'Cycling', 'Swimming', 'Walking/hiking', 'Team/racket sports'],
  NEITHER: ['Yoga/Pilates/mobility', 'Exercise classes', 'Other'],
};

// A field occasionally comes back as an array even for what should be a
// single-answer question - Q7's GHL field is misconfigured as
// MULTIPLE_OPTIONS, and GHL's CHECKBOX fields (Balanced_Training_Need,
// Postnatal_Return_To_Exercise) echo their value as e.g. ["Yes"] rather
// than the plain string, confirmed live. Take the first value in that
// case rather than passing the whole array through to a scoreXXX lookup
// or a strict equality check, either of which would never match.
function scalarAnswer(value) {
  if (Array.isArray(value)) {
    if (value.length > 1) {
      console.warn('Answer field returned multiple values, using the first:', value);
    }
    return value[0];
  }
  return value;
}

// The 18 raw survey answers (Q3-Q20) plus the two goal fields, read
// directly off the GHL contact rather than trusted from webhook merge
// tags — those mappings have repeatedly been wrong or duplicated. A field
// that's genuinely blank on the contact comes back as undefined here,
// which flows straight through to answers.qN — the existing scoreXXX/
// isUnresolved handling in index.js already treats that as unresolved
// rather than guessing a score, so no special-casing is needed for it.
function buildAnswersAndGoalFields(contact) {
  const answers = {};
  for (let q = 3; q <= 20; q++) {
    const fieldId = GHL_SURVEY_ANSWER_FIELD_IDS[`q${q}`];
    answers[`q${q}`] = scalarAnswer(getCustomFieldValue(contact, fieldId));
  }

  const q1Goal = scalarAnswer(getCustomFieldValue(contact, GHL_SURVEY_ANSWER_FIELD_IDS.q1Goal));
  const q2Goals = getCustomFieldValue(contact, GHL_SURVEY_ANSWER_FIELD_IDS.q2Goals);
  const q21Answer = getCustomFieldValue(contact, GHL_SURVEY_ANSWER_FIELD_IDS.q21);
  const q22Answer = getCustomFieldValue(contact, GHL_SURVEY_ANSWER_FIELD_IDS.q22);
  const q17DetailAnswer = getCustomFieldValue(contact, GHL_SURVEY_ANSWER_FIELD_IDS.q17Detail);
  const balancedTrainingNeedAnswer = getCustomFieldValue(
    contact,
    GHL_SURVEY_ANSWER_FIELD_IDS.balancedTrainingNeed,
  );

  return { answers, q1Goal, q2Goals, q21Answer, q22Answer, q17DetailAnswer, balancedTrainingNeedAnswer };
}

// flags.goals needs to be an array. Q1_Main_Goal is a single string;
// Q2_Other_Goals is a genuine multi-select field in GHL and comes back as
// an array already, but handle a comma-separated string too in case that
// ever changes.
function buildGoals(q1Goal, q2Goals) {
  const goals = [];
  const seen = new Set();
  const addGoal = (goal) => {
    if (typeof goal !== 'string') return;
    const trimmed = goal.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      goals.push(trimmed);
    }
  };

  addGoal(q1Goal);

  if (Array.isArray(q2Goals)) {
    q2Goals.forEach(addGoal);
  } else if (typeof q2Goals === 'string' && q2Goals.trim()) {
    q2Goals.split(',').forEach(addGoal);
  }

  return goals;
}

// Q21/Q22 are multi-select fields and normally come back as arrays, but
// handle a comma-separated string too in case that ever changes.
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim());
  }
  return [];
}

function deriveQ21Flags(q21Answer) {
  const selections = toArray(q21Answer);
  const flags = {};
  for (const flagName of Object.values(Q21_OPTION_TO_FLAG)) {
    flags[flagName] = false;
  }
  selections.forEach((selection) => {
    const flagName = Q21_OPTION_TO_FLAG[selection];
    if (flagName) flags[flagName] = true;
  });
  return flags;
}

// Derives existing-exposure/training-gap flags from Q22, per the agreed
// categorization: has strength but no cardio -> gap is CARDIO; has cardio
// but no strength -> gap is STRENGTH; has both, or q22_None, -> NONE.
// (Both-true isn't a gap; q22_None is a complete beginner, and applying
// the MIXED modifier there would boost Hybrid by +3 and wrongly push a
// beginner away from Foundation, so NONE is the safe default.)
function deriveQ22Flags(q22Answer) {
  const selections = toArray(q22Answer);
  const q22_None = selections.includes('None currently');
  const existingStrengthExposure = selections.some((s) => Q22_ACTIVITY_CATEGORIES.STRENGTH.includes(s));
  const existingCardioExposure = selections.some((s) => Q22_ACTIVITY_CATEGORIES.CARDIO.includes(s));
  const existingMixedTraining = existingStrengthExposure && existingCardioExposure;

  let primaryTrainingGap = 'NONE';
  if (!q22_None) {
    if (existingStrengthExposure && !existingCardioExposure) primaryTrainingGap = 'CARDIO';
    else if (existingCardioExposure && !existingStrengthExposure) primaryTrainingGap = 'STRENGTH';
  }

  return {
    q22_None,
    existingStrengthExposure,
    existingCardioExposure,
    existingMixedTraining,
    // Mapped onto the camelCase properties the scoring functions actually
    // read (checked every line of calculateFoundationScore/
    // calculateLiftScore/calculateHybridScore):
    regularStrengthTraining: existingStrengthExposure, // Foundation
    existingStrengthCardioGap: existingStrengthExposure && !existingCardioExposure, // Hybrid
    existingCardioStrengthGap: existingCardioExposure && !existingStrengthExposure, // Hybrid
    // calculateLiftScore reads "strengthTrainingGap", not
    // "existingCardioStrengthGap" - same underlying meaning (cardio
    // exposure without strength exposure), but the naming mismatch meant
    // Lift's own +3 signal never fired. Found in the full input audit;
    // aliased here rather than renaming the Hybrid-facing property, to
    // avoid touching Hybrid's own working wiring.
    strengthTrainingGap: existingCardioExposure && !existingStrengthExposure, // Lift
    strengthAndCardioRelevant: existingMixedTraining, // Hybrid
    primaryTrainingGap,
  };
}

// Q1/Q2 goal options and Q11/Q17 answers that correspond to flags read by
// calculateGoalComplexity/calculateLiftScore/calculateHybridScore/
// calculateHyroxScore, none of which were ever derived from real survey
// data before this - found dormant in the full input audit alongside
// Q17_Event_Detail, a free-text field ("tell us about your event") never
// read anywhere before this either.
//
// Picklist answers (q11Answer/q17Answer) are compared by exact string,
// not via index.js's dash-normalizing lookupAnswer/resolveAnswerForComparison
// - those exist for values that might arrive as user-typed or
// merge-tag-substituted text; a picklist selection read directly off the
// GHL contact is always byte-identical to the configured option string,
// so a plain trim is enough here.
const HYROX_KEYWORD = /hyrox/i;

function deriveEventAndRiskFlags(answers, q17DetailAnswer, goals, q21InjuryPrevention) {
  const q17Answer = typeof answers.q17 === 'string' ? answers.q17.trim() : answers.q17;
  const q11Answer = typeof answers.q11 === 'string' ? answers.q11.trim() : answers.q11;

  const hasEventAnswer =
    q17Answer === 'Yes – recreationally / for enjoyment' ||
    q17Answer === 'Yes – specific event/race/target' ||
    q17Answer === 'Yes – competition/performance is a significant priority';
  const hasEventGoal = goals.includes('Prepare for a sport, event or physical challenge');

  // Section 10's HYROX table lists "Specific HYROX goal +6" and "Q17
  // specifically HYROX +4 additional" - the word "additional" means these
  // are meant to stack (+10 total), not distinguish two different
  // signals, so both use the same underlying check.
  const mentionsHyrox =
    HYROX_KEYWORD.test(String(q17DetailAnswer || '')) || goals.some((goal) => HYROX_KEYWORD.test(goal));

  const wantsInjuryReduction =
    goals.includes('Reduce the chance of pain or injury') ||
    goals.includes('Reduce the chance of pain or injury affecting me'); // Q1/Q2 word this option differently

  return {
    longevityFocus: goals.includes('Stay fit, strong and independent as I get older'),
    hasSportingPerformance: goals.includes('Improve my sporting performance'),
    hasReturnToSport: goals.includes('Return to exercise or sport'),
    eventOrCompetition: hasEventGoal || hasEventAnswer,
    hasEvent: hasEventGoal || hasEventAnswer,
    hasComplexPerformanceTarget: q17Answer === 'Yes – competition/performance is a significant priority',
    hasRecurringIssue: q11Answer === 'It has returned more than once',
    recurrencePrevention: q11Answer === "I'd like advice about reducing recurrence",
    futureInjuryRisk:
      q11Answer === 'I\'m concerned increasing exercise could make it worse' ||
      Boolean(q21InjuryPrevention) ||
      wantsInjuryReduction,
    specificHyroxGoal: mentionsHyrox,
    q17SpecificallyHyrox: mentionsHyrox,
  };
}

// ===== STAFF-ENTERED OVERRIDES (brief section 21) =====
// Preferred_Training_Style, Individual_Attention_Preference,
// Postnatal_Return_To_Exercise and Clinical_Barrier_To_Primary_Goal are
// not survey questions - staff enter them directly on the contact via the
// staff page's "Staff Assessment" section. Read here so they're honored
// on every path that runs the engine (a manual Recalculate, or a future
// survey resubmission), not just the staff page's own recalculation.
const PREFERRED_STYLE_OPTION_TO_VALUE = {
  'No preference': 'NONE',
  'Strength-focused': 'STRENGTH',
  'Mixed/balanced': 'MIXED',
  'Conditioning/HYROX-style': 'CONDITIONING_HYROX',
};

const CLINICAL_BARRIER_OPTION_TO_VALUE = {
  'Not reviewed': undefined,
  'Yes - confirmed': true,
  'No - not a barrier': false,
};

const INDIVIDUAL_ATTENTION_DEFAULT = 'MODERATE';

function buildStaffOverrideFlags(contact) {
  const preferredStyleAnswer = scalarAnswer(
    getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.preferredTrainingStyle),
  );
  const individualAttentionAnswer = scalarAnswer(
    getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.individualAttentionPreference),
  );
  const postnatalAnswer = scalarAnswer(
    getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.postnatalReturnToExercise),
  );
  const clinicalBarrierAnswer = scalarAnswer(
    getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.clinicalBarrierToPrimaryGoal),
  );

  return {
    preferredStyle: PREFERRED_STYLE_OPTION_TO_VALUE[preferredStyleAnswer] || 'NONE',
    // Section 12: "LOW / MODERATE / HIGH is staff-editable and affects
    // VIP, not assessed PT Need" - defaults to MODERATE (no adjustment)
    // whenever staff haven't set it.
    individualAttentionPreference:
      ['LOW', 'MODERATE', 'HIGH'].includes(individualAttentionAnswer)
        ? individualAttentionAnswer
        : INDIVIDUAL_ATTENTION_DEFAULT,
    postnatalReturnToExercise: postnatalAnswer === 'Yes',
    // undefined (not reviewed) deliberately passed through as-is here -
    // runFullAssessment's own fallthrough is what decides whether this
    // overrides the Q10 stopgap or not.
    clinicalBarrierToPrimaryGoalOverride: Object.prototype.hasOwnProperty.call(
      CLINICAL_BARRIER_OPTION_TO_VALUE,
      clinicalBarrierAnswer,
    )
      ? CLINICAL_BARRIER_OPTION_TO_VALUE[clinicalBarrierAnswer]
      : undefined,
  };
}

module.exports = {
  Q21_OPTION_TO_FLAG,
  Q22_ACTIVITY_CATEGORIES,
  PREFERRED_STYLE_OPTION_TO_VALUE,
  CLINICAL_BARRIER_OPTION_TO_VALUE,
  INDIVIDUAL_ATTENTION_DEFAULT,
  scalarAnswer,
  buildAnswersAndGoalFields,
  buildGoals,
  toArray,
  deriveQ21Flags,
  deriveQ22Flags,
  deriveEventAndRiskFlags,
  buildStaffOverrideFlags,
};
