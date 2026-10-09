// Scores one GHL contact from the survey answers stored on it.
//
// This is the body of api/assessment.js (the workflow's scoring webhook), pulled out so the
// client results page can run exactly the same scoring on first view when the webhook has not
// landed yet. One function, two callers: the two can never drift apart.
//
// Pure apart from loading the engine: it reads answers off the contact object it is given, and
// returns the result plus the inputs the GHL writer stores alongside it.

const {
  buildAnswersAndGoalFields,
  buildGoals,
  deriveQ21Flags,
  deriveQ22Flags,
  deriveEventAndRiskFlags,
  buildStaffOverrideFlags,
  scalarAnswer,
} = require('./deriveFlags.js');

// bodyFlags: any extra flags the webhook body carried (goals and every derived flag take
// precedence over anything with the same name there).
function scoreContact(contact, bodyFlags) {
  // Loaded here, not at the top: index.js runs a long self-test when it loads, and the results
  // page only needs it on the (rare) first-view path.
  const { runFullAssessmentWithPricing } = require('../index.js');

  const { answers, q1Goal, q2Goals, q21Answer, q22Answer, q17DetailAnswer, balancedTrainingNeedAnswer } =
    buildAnswersAndGoalFields(contact);

  // goals is always the contact-derived value, so the flags below agree with whatever goals the
  // engine actually scores against.
  const goals = buildGoals(q1Goal, q2Goals);
  const q21Flags = deriveQ21Flags(q21Answer);
  const q22Flags = deriveQ22Flags(q22Answer);
  const eventAndRiskFlags = deriveEventAndRiskFlags(answers, q17DetailAnswer, goals, q21Flags.q21_InjuryPrevention);
  // Brief section 21's staff-only inputs, read here too so a resubmission still respects them.
  const staffOverrideFlags = buildStaffOverrideFlags(contact);

  const derivedFlags = {
    ...q21Flags,
    ...q22Flags,
    ...eventAndRiskFlags,
    // Balanced_Training_Need is a GHL CHECKBOX field and comes back as an array (["Yes"]).
    balancedTrainingNeed: scalarAnswer(balancedTrainingNeedAnswer) === 'Yes',
    ...staffOverrideFlags,
  };

  let flags = { ...(bodyFlags || {}), goals };
  flags = { ...flags, ...derivedFlags };

  const result = runFullAssessmentWithPricing(answers, flags);
  return { result, answers, q21Answer, q22Answer, derivedFlags };
}

module.exports = { scoreContact };
