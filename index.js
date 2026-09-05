// ONETEQ Scoring Engine — Step 1: Input Scoring

// Answers can arrive with stray leading/trailing or doubled-up internal
// whitespace (a real submission has arrived as "Very significantly " with
// a trailing space). Trim and collapse that before any comparison or
// lookup, everywhere an answer string is matched.
function normalizeAnswer(text) {
  if (typeof text !== "string") return text;
  return text.trim().replace(/\s+/g, " ");
}

// Some option labels use an en dash ("–") as a punctuation separator (e.g.
// "Very easy – highly consistent"), and an answer can arrive with a plain
// hyphen ("-") there instead. But other option labels have a *literal*
// hyphen as part of a real word — "Occasional check-ins",
// "Intensive/high-touch" — where converting "-" to "–" is wrong and
// corrupts an otherwise-correct answer into one that matches nothing.
// There's no reliable way to tell these apart from the character alone,
// so always try the answer exactly as given (after whitespace
// normalization) first, and only fall back to converting "-" to "–" if
// that didn't match anything.
function dashConvert(text) {
  return typeof text === "string" ? text.replace(/-/g, "–") : text;
}

function lookupAnswer(scoreMap, rawAnswer) {
  const answer = normalizeAnswer(rawAnswer);
  if (typeof answer !== "string") return undefined;
  if (Object.prototype.hasOwnProperty.call(scoreMap, answer)) {
    return scoreMap[answer];
  }
  return scoreMap[dashConvert(answer)];
}

// Same fallback order as lookupAnswer, but for a chain of === comparisons
// against a fixed list of literal option strings rather than an object
// lookup — returns whichever form (as-typed, or dash-converted) actually
// matches one of validOptions, so the caller's existing === chain just
// works unchanged.
function resolveAnswerForComparison(rawAnswer, validOptions) {
  const answer = normalizeAnswer(rawAnswer);
  if (typeof answer !== "string") return answer;
  if (validOptions.includes(answer)) return answer;
  const converted = dashConvert(answer);
  if (validOptions.includes(converted)) return converted;
  return answer;
}

// A blank/unanswered question can surface as undefined (e.g. an answer
// string that doesn't match any option in a scoreXXX lookup) as well as
// the explicit null used for "needs discussion" answers. Treat both as
// unresolved everywhere downstream.
function isUnresolved(value) {
  return value === null || value === undefined;
}

// This function takes the answer to Q3 and converts it to a number
function scoreCurrentActivity(answer) {
  const scoreMap = {
    "Very little or no structured exercise": 0,
    "Some activity, but inconsistent": 1,
    "1–2 times per week": 2,
    "3–4 times per week": 3.5,
    "5+ times per week": 5,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Test it with a sample answer
const testAnswer = "3–4 times per week";
const scoreResult = scoreCurrentActivity(testAnswer);

console.log("Answer given:", testAnswer);
console.log("Score calculated:", scoreResult);
// Q4: Desired Total Frequency → Training Contribution score
function scoreTrainingContribution(answer) {
  const scoreMap = {
    "1 session per week": 3,
    "2 sessions per week": 5,
    "3 sessions per week": 7,
    "4 sessions per week": 9,
    "5+ sessions per week": 10,
    "I'd like advice on this": null, // NULL means "needs discussion", not zero
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Test it
const testAnswer2 = "3 sessions per week";
const result2 = scoreTrainingContribution(testAnswer2);
console.log("Q4 Answer given:", testAnswer2);
console.log("Q4 Score calculated:", result2);
// Q5: Desired ONETEQ Frequency → ONETEQ Frequency score
function scoreONETEQFrequency(answer) {
  const scoreMap = {
    "Occasional, less than weekly": 0.5,
    "1 session per week": 1,
    "2 sessions per week": 2,
    "3 sessions per week": 3,
    "4+ sessions per week": 4,
    "I'd like you to recommend this": null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q6: Programming Confidence → Programming Support Need score
function scoreProgrammingSupportNeed(answer) {
  const scoreMap = {
    "Very confident, I know exactly what to do": 1,
    "Fairly confident": 3,
    "Not very confident": 5,
    "Not confident at all": 8,
    Unsure: null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q7: Technique Confidence → Technique Support Need score
function scoreTechniqueSupportNeed(answer) {
  const scoreMap = {
    "Very confident": 1,
    "Quite confident": 3,
    "Somewhat confident": 5,
    "Not very confident": 8,
    "Not confident at all": 10,
    "It depends on the exercise / I'm unsure": null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Test all three
console.log("Q5 Score:", scoreONETEQFrequency("2 sessions per week"));
console.log("Q6 Score:", scoreProgrammingSupportNeed("Not very confident"));
console.log("Q7 Score:", scoreTechniqueSupportNeed("Somewhat confident"));
// Q8: Consistency → Consistency Support Need score
function scoreConsistencySupportNeed(answer) {
  const scoreMap = {
    "Very easy – highly consistent": 1,
    "Quite easy – usually consistent": 3,
    "It varies": 5,
    "Quite difficult – often fall out of routine": 8,
    "Very difficult – much more likely if someone expects me": 10,
    "I'm not sure": null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q9: Desired Accountability → Desired Accountability Level score
function scoreDesiredAccountabilityLevel(answer) {
  const scoreMap = {
    "Very little": 1,
    "Occasional check-ins": 3,
    "Regular support": 6,
    "High level": 8,
    "Very high/frequent": 10,
    "Recommend what you think would work best": null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q10: Current Clinical Impact → Current Clinical Impact score
function scoreCurrentClinicalImpact(answer) {
  const scoreMap = {
    "Not at all": 0,
    "A little": 3,
    Moderately: 6,
    Significantly: 8,
    "Very significantly": 10,
    Unsure: null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Test all three
console.log("Q8 Score:", scoreConsistencySupportNeed("It varies"));
console.log("Q9 Score:", scoreDesiredAccountabilityLevel("Regular support"));
console.log("Q10 Score:", scoreCurrentClinicalImpact("A little"));
// Q11: Recurrence Concern → Recurrence Concern score
function scoreRecurrenceConcern(answer) {
  const scoreMap = {
    No: 0,
    "Yes, but I'm confident managing it": 2,
    "I'd like advice about reducing recurrence": 5,
    "It has returned more than once": 7,
    "I'm concerned increasing exercise could make it worse": 9,
    Unsure: null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q13: Nutrition Importance → Nutrition Relevance score
function scoreNutritionRelevance(answer) {
  const scoreMap = {
    "Not particularly": 1,
    Slightly: 3,
    Moderately: 5,
    Very: 8,
    Essential: 10,
    Unsure: null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q14: Nutrition Confidence → Nutrition Current Support Need score
function scoreNutritionCurrentSupportNeed(answer) {
  const scoreMap = {
    "Very confident": 1,
    "Quite confident": 3,
    "Somewhat confident": 5,
    "Not very confident": 8,
    "Not confident at all": 10,
    Unsure: null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Test all three
console.log(
  "Q11 Score:",
  scoreRecurrenceConcern("It has returned more than once"),
);
console.log("Q13 Score:", scoreNutritionRelevance("Very"));
console.log(
  "Q14 Score:",
  scoreNutritionCurrentSupportNeed("Not very confident"),
);
console.log(
  "--- SESSION 1 COMPLETE: Q3-Q14 scoring functions built and verified ---",
);
// Q12: Previous Treatment → modifies the Q10 clinical impact score
// Rule: resolved + Q10=0 → -1 (minimum 0) | never resolved → +1 | keeps recurring → +2 | currently receiving treatment → flag only, no score change
function scoreClinicalModifier(q10Answer, q10Score, q12Answer) {
  let modifier = 0;
  let flagCurrentTreatment = false;
  const normalizedQ12Answer = resolveAnswerForComparison(q12Answer, [
    "Yes – and it resolved",
    "Yes – but it never completely resolved",
    "Yes – but it keeps recurring",
    "I'm currently receiving treatment",
  ]);

  if (normalizedQ12Answer === "Yes – and it resolved" && q10Score === 0) {
    modifier = -1;
  } else if (normalizedQ12Answer === "Yes – but it never completely resolved") {
    modifier = 1;
  } else if (normalizedQ12Answer === "Yes – but it keeps recurring") {
    modifier = 2;
  } else if (normalizedQ12Answer === "I'm currently receiving treatment") {
    flagCurrentTreatment = true; // no score change, just a flag
  }

  // Apply modifier to Q10 score, but never go below 0
  let adjustedScore = q10Score + modifier;
  if (adjustedScore < 0) adjustedScore = 0;

  return {
    modifier: modifier,
    adjustedClinicalScore: adjustedScore,
    currentlyReceivingTreatment: flagCurrentTreatment,
  };
}

// Test it
const q10TestScore = scoreCurrentClinicalImpact("Not at all"); // should be 0
const q12Result = scoreClinicalModifier(
  "It has returned more than once",
  q10TestScore,
  "Yes – and it resolved",
);
console.log("Q12 Test Result:", q12Result);
// Q15: Desired Nutrition Support → Desired Nutrition Support score
function scoreDesiredNutritionSupport(answer) {
  const scoreMap = {
    None: 0,
    "Occasional guidance": 3,
    "Some ongoing support": 6,
    "High level": 8,
    "Intensive/high-touch": 10,
    "Recommend for me": null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q16: Performance Importance → Performance Importance score
function scorePerformanceImportance(answer) {
  const scoreMap = {
    "Not particularly": 0,
    Slightly: 2,
    Moderately: 5,
    Very: 8,
    Extremely: 10,
    Unsure: null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q17: Event Training → Event Performance Relevance score
function scoreEventPerformanceRelevance(answer) {
  const scoreMap = {
    No: 0,
    "Not currently, but I'd like to work towards something": 3,
    "Yes – recreationally / for enjoyment": 5,
    "Yes – specific event/race/target": 8,
    "Yes – competition/performance is a significant priority": 10,
    Unsure: null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Test all three
console.log("Q15 Score:", scoreDesiredNutritionSupport("Some ongoing support"));
console.log("Q16 Score:", scorePerformanceImportance("Very"));
console.log(
  "Q17 Score:",
  scoreEventPerformanceRelevance("Yes – specific event/race/target"),
);
// Q18: Objective Data Interest → Objective Data Interest score
function scoreObjectiveDataInterest(answer) {
  const scoreMap = {
    "Not important": 0,
    "Nice to know": 2,
    Useful: 5,
    "Very useful": 8,
    "Extremely valuable": 10,
    Unsure: null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q19: Recovery Quality → Recovery Support Need score
function scoreRecoverySupportNeed(answer) {
  const scoreMap = {
    "Very well – rarely an issue": 0,
    "Quite well – occasional issues": 2,
    "Reasonably – sometimes affects what I do": 5,
    "Not particularly well – regularly affects activity/training": 8,
    "Poorly – significant barrier": 10,
    Unsure: null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Q20: Desired Recovery Support → Desired Recovery Support score
function scoreDesiredRecoverySupport(answer) {
  const scoreMap = {
    None: 0,
    "Occasional advice/support": 3,
    "Regular support": 6,
    "High level": 9,
    "Recommend for me": null,
  };
  return lookupAnswer(scoreMap, answer) ?? null;
}

// Test all three
console.log("Q18 Score:", scoreObjectiveDataInterest("Very useful"));
console.log(
  "Q19 Score:",
  scoreRecoverySupportNeed("Reasonably – sometimes affects what I do"),
);
console.log("Q20 Score:", scoreDesiredRecoverySupport("Regular support"));
console.log("--- ALL INPUT SCORING FUNCTIONS COMPLETE: Q3-Q20 ---");
// ===== SEVEN-AXIS RADAR SCORES =====
// Each axis combines multiple question scores with specific weights.
// If any input is null (unresolved), the axis is marked unresolved rather than calculated.

function calculateCoachingAxis(programmingSupportNeed, techniqueSupportNeed) {
  if (isUnresolved(programmingSupportNeed) || isUnresolved(techniqueSupportNeed)) {
    return { score: null, unresolved: true };
  }
  const score = 0.55 * programmingSupportNeed + 0.45 * techniqueSupportNeed;
  return { score: Math.round(score * 10) / 10, unresolved: false }; // rounds to 1 decimal
}

function calculateAccountabilityAxis(
  consistencySupportNeed,
  desiredAccountabilityLevel,
) {
  if (isUnresolved(consistencySupportNeed) || isUnresolved(desiredAccountabilityLevel)) {
    return { score: null, unresolved: true };
  }
  const score = 0.7 * consistencySupportNeed + 0.3 * desiredAccountabilityLevel;
  return { score: Math.round(score * 10) / 10, unresolved: false };
}

function calculateClinicalSupportAxis(
  currentClinicalImpact,
  recurrenceConcern,
  q12Modifier,
) {
  if (isUnresolved(currentClinicalImpact) || isUnresolved(recurrenceConcern)) {
    return { score: null, unresolved: true };
  }
  let score = 0.7 * currentClinicalImpact + 0.3 * recurrenceConcern;
  score = score + q12Modifier; // apply the Q12 modifier
  if (score < 0) score = 0;
  if (score > 10) score = 10; // capped at 10 per the brief
  return { score: Math.round(score * 10) / 10, unresolved: false };
}

// Test all three using scores we already calculated
const coachingAxis = calculateCoachingAxis(5, 5); // Q6=5, Q7=5
console.log("Coaching Axis:", coachingAxis);

const accountabilityAxis = calculateAccountabilityAxis(5, 6); // Q8=5, Q9=6
console.log("Accountability Axis:", accountabilityAxis);

const clinicalAxis = calculateClinicalSupportAxis(3, 7, 0); // Q10=3, Q11=7, no modifier
console.log("Clinical Support Axis:", clinicalAxis);
function calculateNutritionSupportAxis(
  nutritionRelevance,
  nutritionCurrentSupportNeed,
  desiredNutritionSupport,
) {
  if (
    isUnresolved(nutritionRelevance) ||
    isUnresolved(nutritionCurrentSupportNeed) ||
    isUnresolved(desiredNutritionSupport)
  ) {
    return { score: null, unresolved: true };
  }
  const score =
    0.3 * nutritionRelevance +
    0.5 * nutritionCurrentSupportNeed +
    0.2 * desiredNutritionSupport;
  return { score: Math.round(score * 10) / 10, unresolved: false };
}

function calculatePerformanceFocusAxis(
  performanceImportance,
  eventPerformanceRelevance,
  objectiveDataInterest,
) {
  if (
    isUnresolved(performanceImportance) ||
    isUnresolved(eventPerformanceRelevance) ||
    isUnresolved(objectiveDataInterest)
  ) {
    return { score: null, unresolved: true };
  }
  const score =
    0.45 * performanceImportance +
    0.3 * eventPerformanceRelevance +
    0.25 * objectiveDataInterest;
  return { score: Math.round(score * 10) / 10, unresolved: false };
}

function calculateRecoverySupportAxis(
  recoverySupportNeed,
  desiredRecoverySupport,
) {
  if (isUnresolved(recoverySupportNeed) || isUnresolved(desiredRecoverySupport)) {
    return { score: null, unresolved: true };
  }
  const score = 0.7 * recoverySupportNeed + 0.3 * desiredRecoverySupport;
  return { score: Math.round(score * 10) / 10, unresolved: false };
}

// Test all three using scores we already calculated
const nutritionAxis = calculateNutritionSupportAxis(8, 8, 6); // Q13=8, Q14=8, Q15=6
console.log("Nutrition Support Axis:", nutritionAxis);

const performanceAxis = calculatePerformanceFocusAxis(8, 8, 8); // Q16=8, Q17=8, Q18=8
console.log("Performance Focus Axis:", performanceAxis);

const recoveryAxis = calculateRecoverySupportAxis(5, 6); // Q19=5, Q20=6
console.log("Recovery Support Axis:", recoveryAxis);
function calculateTrainingAxis(trainingContributionScore) {
  if (isUnresolved(trainingContributionScore)) {
    return { score: null, unresolved: true };
  }
  // Training axis is the Q4 training contribution score itself
  // (later stages may let staff "agree" an adjusted value, but this is the base calculation)
  return {
    score: Math.round(trainingContributionScore * 10) / 10,
    unresolved: false,
  };
}

// Test it
const trainingAxis = calculateTrainingAxis(7); // Q4 score = 7
console.log("Training Axis:", trainingAxis);
console.log("--- ALL 7 AXIS FORMULAS COMPLETE ---");
// ===== CLASS SCORING: FOUNDATION =====
// Takes a bundle of the person's relevant answers/flags and returns Foundation's point total

function calculateFoundationScore(inputs) {
  let points = 0;
  const q3Answer = resolveAnswerForComparison(inputs.q3Answer, [
    "Very little or no structured exercise",
    "Some activity, but inconsistent",
    "1–2 times per week",
    "3–4 times per week",
    "5+ times per week",
  ]);

  // Q3 Current activity
  if (q3Answer === "Very little or no structured exercise") points += 4;
  else if (q3Answer === "Some activity, but inconsistent") points += 3;
  else if (q3Answer === "1–2 times per week") points += 1;
  else if (q3Answer === "3–4 times per week" || q3Answer === "5+ times per week")
    points += 0;

  // Programming Support Need
  if (
    !isUnresolved(inputs.programmingSupportNeed) &&
    inputs.programmingSupportNeed >= 7
  )
    points += 2;

  // Technique Need
  if (!isUnresolved(inputs.techniqueSupportNeed)) {
    if (inputs.techniqueSupportNeed >= 7) points += 4;
    else if (inputs.techniqueSupportNeed >= 5) points += 2;
  }

  // Goals (from Q1/Q2)
  if (inputs.goals.includes("Exercise with more confidence")) points += 3;
  if (inputs.goals.includes("Improve my general health and fitness"))
    points += 2;
  if (inputs.goals.includes("Return to exercise or sport")) points += 2;

  // Q21 flags
  if (inputs.q21_Balance) points += 2;
  if (inputs.q21_Independence) points += 1;

  // Q22 none currently
  if (inputs.q22_None) points += 3;

  // Negative modifiers
  if (inputs.regularStrengthTraining) points -= 3;
  if (
    !isUnresolved(inputs.performanceFocusScore) &&
    inputs.performanceFocusScore >= 8
  )
    points -= 2;

  // Postnatal flag
  if (inputs.postnatalReturnToExercise) points += 4;

  return points;
}

// Test it with a sample person
const testInputs = {
  q3Answer: "Very little or no structured exercise",
  programmingSupportNeed: 8,
  techniqueSupportNeed: 8,
  goals: [
    "Exercise with more confidence",
    "Improve my general health and fitness",
  ],
  q21_Balance: true,
  q21_Independence: false,
  q22_None: true,
  regularStrengthTraining: false,
  performanceFocusScore: 2,
  postnatalReturnToExercise: false,
};

console.log("Foundation Score:", calculateFoundationScore(testInputs));
// ===== CLASS SCORING: LIFT =====
function calculateLiftScore(inputs) {
  let points = 0;

  if (inputs.goals.includes("Get stronger or build muscle")) points += 5;
  if (inputs.longevityFocus) points += 3;
  if (inputs.futureInjuryRisk) points += 2;
  if (inputs.recurrencePrevention) points += 2;
  if (inputs.goals.includes("Improve my sporting performance")) points += 3;
  if (inputs.eventOrCompetition) points += 2;
  if (inputs.goals.includes("Improve my general health and fitness"))
    points += 2;
  if (inputs.goals.includes("Lose weight or reduce body fat")) points += 2;

  if (inputs.q21_Strength) points += 4;
  if (inputs.q21_Independence) points += 2;
  if (inputs.q21_InjuryPrevention) points += 2;
  if (inputs.q21_BodyComposition) points += 1;

  if (inputs.strengthTrainingGap) points += 3;

  if (!isUnresolved(inputs.performanceFocusScore)) {
    if (inputs.performanceFocusScore >= 8) points += 2;
    else if (inputs.performanceFocusScore >= 5) points += 1;
  }

  if (!isUnresolved(inputs.techniqueSupportNeed)) {
    if (inputs.techniqueSupportNeed >= 8) points -= 2;
    else if (inputs.techniqueSupportNeed >= 5) points -= 1;
  }

  if (inputs.preferredStyle === "STRENGTH") points += 4;

  return points;
}

// Test it
const liftTestInputs = {
  goals: ["Get stronger or build muscle"],
  longevityFocus: false,
  futureInjuryRisk: false,
  recurrencePrevention: false,
  eventOrCompetition: false,
  q21_Strength: true,
  q21_Independence: false,
  q21_InjuryPrevention: false,
  q21_BodyComposition: false,
  strengthTrainingGap: true,
  performanceFocusScore: 8,
  techniqueSupportNeed: 3,
  preferredStyle: "STRENGTH",
};

console.log("Lift Score:", calculateLiftScore(liftTestInputs));
// ===== CLASS SCORING: HYBRID =====
function calculateHybridScore(inputs) {
  let points = 0;

  if (inputs.goals.includes("Improve my general health and fitness"))
    points += 4;
  if (inputs.longevityFocus) points += 4;
  if (inputs.goals.includes("Lose weight or reduce body fat")) points += 3;
  if (inputs.goals.includes("Improve my cardiovascular fitness or endurance"))
    points += 3;
  if (inputs.goals.includes("Get stronger or build muscle")) points += 2;
  if (inputs.goals.includes("Improve my sporting performance")) points += 2;
  if (inputs.eventOrCompetition) points += 1;
  if (inputs.futureInjuryRisk) points += 1;

  if (inputs.q21_Strength) points += 2;
  if (inputs.q21_Cardiovascular) points += 3;
  if (inputs.q21_Independence) points += 2;
  if (inputs.q21_BodyComposition) points += 2;

  if (inputs.balancedTrainingNeed) points += 3;

  if (
    normalizeAnswer(inputs.q5Answer) === "1 session per week" &&
    inputs.strengthAndCardioRelevant
  )
    points += 2;

  if (
    !isUnresolved(inputs.performanceFocusScore) &&
    inputs.performanceFocusScore >= 5
  )
    points += 1;

  if (!isUnresolved(inputs.techniqueSupportNeed)) {
    if (inputs.techniqueSupportNeed >= 8) points -= 2;
    else if (inputs.techniqueSupportNeed >= 5) points -= 1;
  }

  if (inputs.existingStrengthCardioGap) points += 2;
  if (inputs.existingCardioStrengthGap) points += 2;

  if (inputs.preferredStyle === "MIXED") points += 4;

  return points;
}

// Test it
const hybridTestInputs = {
  goals: [
    "Improve my general health and fitness",
    "Improve my cardiovascular fitness or endurance",
  ],
  longevityFocus: true,
  eventOrCompetition: false,
  futureInjuryRisk: false,
  q21_Strength: false,
  q21_Cardiovascular: true,
  q21_Independence: false,
  q21_BodyComposition: false,
  balancedTrainingNeed: true,
  q5Answer: "2 sessions per week",
  strengthAndCardioRelevant: false,
  performanceFocusScore: 6,
  techniqueSupportNeed: 4,
  existingStrengthCardioGap: false,
  existingCardioStrengthGap: false,
  preferredStyle: "MIXED",
};

console.log("Hybrid Score:", calculateHybridScore(hybridTestInputs));
// ===== CLASS SCORING: HYROX =====
function calculateHyroxScore(inputs) {
  let points = 0;

  if (inputs.specificHyroxGoal) points += 6;
  if (inputs.eventOrCompetition) points += 3;
  if (inputs.goals.includes("Improve my cardiovascular fitness or endurance"))
    points += 4;
  if (inputs.goals.includes("Improve my sporting performance")) points += 3;
  if (inputs.goals.includes("Improve my general health and fitness"))
    points += 3;
  if (inputs.goals.includes("Lose weight or reduce body fat")) points += 2;
  if (inputs.longevityFocus) points += 2;
  if (inputs.goals.includes("Get stronger or build muscle")) points += 1;

  if (inputs.q21_Cardiovascular) points += 3;
  if (inputs.q21_Independence) points += 1;
  if (inputs.q21_BodyComposition) points += 1;

  const q3Answer = resolveAnswerForComparison(inputs.q3Answer, [
    "Very little or no structured exercise",
    "Some activity, but inconsistent",
    "1–2 times per week",
    "3–4 times per week",
    "5+ times per week",
  ]);
  if (q3Answer === "1–2 times per week") points += 1;
  else if (q3Answer === "3–4 times per week" || q3Answer === "5+ times per week")
    points += 2;
  else if (q3Answer === "Very little or no structured exercise") points -= 3;

  if (!isUnresolved(inputs.techniqueSupportNeed)) {
    if (inputs.techniqueSupportNeed >= 8) points -= 3;
    else if (inputs.techniqueSupportNeed >= 5) points -= 1;
  }

  if (!isUnresolved(inputs.performanceFocusScore)) {
    if (inputs.performanceFocusScore >= 8) points += 2;
    else if (inputs.performanceFocusScore >= 5) points += 1;
  }

  if (inputs.q17SpecificallyHyrox) points += 4;
  if (inputs.preferredStyle === "CONDITIONING_HYROX") points += 4;

  return points;
}

// Test it
const hyroxTestInputs = {
  specificHyroxGoal: true,
  eventOrCompetition: true,
  goals: [
    "Improve my cardiovascular fitness or endurance",
    "Improve my sporting performance",
  ],
  longevityFocus: false,
  q21_Cardiovascular: true,
  q21_Independence: false,
  q21_BodyComposition: false,
  q3Answer: "3–4 times per week",
  techniqueSupportNeed: 3,
  performanceFocusScore: 9,
  q17SpecificallyHyrox: true,
  preferredStyle: "CONDITIONING_HYROX",
};

console.log("HYROX Score:", calculateHyroxScore(hyroxTestInputs));
console.log("--- ALL 4 CLASS MATRICES COMPLETE ---");
// ===== CLASS TIE-BREAKING =====

function applyTrainingGapModifiers(scores, primaryTrainingGap) {
  // scores = { foundation, lift, hybrid, hyrox }
  let adjusted = { ...scores };

  if (primaryTrainingGap === "STRENGTH") {
    adjusted.lift += 3;
    adjusted.hybrid += 1;
  } else if (primaryTrainingGap === "CARDIO") {
    adjusted.hybrid += 2;
    adjusted.hyrox += 2;
  } else if (primaryTrainingGap === "MIXED") {
    adjusted.hybrid += 3;
    adjusted.hyrox += 1;
    adjusted.lift += 1;
  }
  // NONE = no modifier

  return adjusted;
}

function floorScores(scores) {
  // Raw points are internal only; floor negatives at 0
  return {
    foundation: Math.max(0, scores.foundation),
    lift: Math.max(0, scores.lift),
    hybrid: Math.max(0, scores.hybrid),
    hyrox: Math.max(0, scores.hyrox),
  };
}

// Client-requested change to class-match selection, deliberately
// superseding brief section 11's "if no class reaches 7, flag for staff
// discussion": 7 is now a confidence threshold for how a match is
// *labelled* (matchType), not a minimum score required to return one at
// all. The highest-scoring eligible class is always returned as either a
// STRONG_MATCH (>=7) or a BEST_STARTING_MATCH (<7) — nothing scoring
// below 7 is a reason on its own to withhold a recommendation or flag for
// discussion anymore.

// "Effectively tied" for the Foundation tie-break below: within this many
// points of the top score. Class scores move in small increments (often
// 1-4 points per criterion), so a 1-point margin is a tight, conservative
// definition of "no real separation" without starting to override
// clearly-differentiated results.
const FOUNDATION_TIE_TOLERANCE = 1;

// "Low confidence" for the same tie-break: reuses the >=5 threshold
// already used as the "moderate need" tier for techniqueSupportNeed in
// calculateLiftScore/calculateHybridScore/calculateHyroxScore (Foundation
// itself uses a >=7 threshold, but that's specific to Foundation's own
// bonus calculation, not a general confidence line) - the more inclusive
// >=5 threshold errs toward prioritising the safer Foundation class
// whenever confidence is genuinely in question, not only when it's very
// low.
const LOW_CONFIDENCE_THRESHOLD = 5;

function isLowConfidence(programmingSupportNeed, techniqueSupportNeed) {
  return (
    (!isUnresolved(programmingSupportNeed) && programmingSupportNeed >= LOW_CONFIDENCE_THRESHOLD) ||
    (!isUnresolved(techniqueSupportNeed) && techniqueSupportNeed >= LOW_CONFIDENCE_THRESHOLD)
  );
}

function determineBestMatch(scores, foundationOverrideConditions) {
  // Check Foundation Starting Override first — unchanged, and still takes
  // priority over everything below (hard eligibility/safety rules always
  // win over the tie-break and the confidence labelling).
  const {
    techniqueSupportNeed,
    programmingSupportNeed,
    q3Answer: rawQ3Answer,
    foundationScore,
  } = foundationOverrideConditions;
  const q3Answer = normalizeAnswer(rawQ3Answer);
  const activityIsLowOrInconsistent =
    q3Answer === "Very little or no structured exercise" ||
    q3Answer === "Some activity, but inconsistent";

  if (
    !isUnresolved(techniqueSupportNeed) &&
    techniqueSupportNeed >= 8 &&
    activityIsLowOrInconsistent &&
    foundationScore >= 10
  ) {
    return {
      bestStartingMatch: "foundation",
      matchType: "BEST_STARTING_MATCH",
      overrideApplied: true,
      flagForDiscussion: false,
      note: "Foundation Starting Override applied — highest appropriate physiological class becomes Future Match",
    };
  }

  // Normal path: find highest score
  const entries = Object.entries(scores); // [["foundation", 20], ["lift", 18], ...]
  entries.sort((a, b) => b[1] - a[1]); // sort descending by score
  const [topClass, topScore] = entries[0];

  // Tie-break: if Foundation is tied or effectively tied with whichever
  // of Lift/Hybrid is currently leading, and training (Q6) or technique
  // (Q7) confidence is low, prioritise Foundation over the raw score
  // order. Hyrox is deliberately excluded from this rule. This can only
  // change the outcome when Lift/Hybrid is strictly ahead of Foundation
  // by no more than the tie tolerance — on an exact tie, Object.entries'
  // insertion order (foundation, lift, hybrid, hyrox) plus a stable sort
  // already keeps Foundation first.
  let winnerClass = topClass;
  if (
    (topClass === "lift" || topClass === "hybrid") &&
    topScore - scores.foundation <= FOUNDATION_TIE_TOLERANCE &&
    isLowConfidence(programmingSupportNeed, techniqueSupportNeed)
  ) {
    winnerClass = "foundation";
  }
  const winnerScore = scores[winnerClass];

  const matchType = winnerScore >= 7 ? "STRONG_MATCH" : "BEST_STARTING_MATCH";

  // flagForDiscussion is now reserved for a genuine unresolved input (we
  // can't reliably evaluate the safety override or tie-break above
  // without Q6/Q7) or a real appropriateness problem (the top score is 0
  // — no class showed any positive signal at all) — not merely for
  // landing below the old 7-point threshold, which is now just a
  // confidence label.
  const flagForDiscussion =
    isUnresolved(programmingSupportNeed) ||
    isUnresolved(techniqueSupportNeed) ||
    topScore <= 0;

  return {
    bestStartingMatch: winnerClass,
    matchType,
    topScore: winnerScore,
    overrideApplied: false,
    flagForDiscussion,
    allScores: entries,
  };
}

// Test the full flow using our test scores
const rawScores = { foundation: 20, lift: 18, hybrid: 22, hyrox: 31 };
const flooredScores = floorScores(rawScores);
const modifiedScores = applyTrainingGapModifiers(flooredScores, "CARDIO");
console.log("Scores after modifiers:", modifiedScores);

const result = determineBestMatch(modifiedScores, {
  techniqueSupportNeed: 3,
  q3Answer: "3–4 times per week",
  foundationScore: modifiedScores.foundation,
});
console.log("Best Match Result:", result);
// ===== PT / 1:1 COACHING ENGINE =====
// PT_Need_Score = 0.35 × Programming_Support_Need + 0.35 × Technique_Support_Need + 0.20 × Accountability_Score + 0.10 × Goal_Complexity

function calculateGoalComplexity(
  goals,
  hasRecurringIssue,
  hasReturnToSport,
  hasEvent,
  hasSportingPerformance,
  hasComplexPerformanceTarget,
) {
  // Highest applicable complexity wins
  if (hasComplexPerformanceTarget) return 10;
  if (hasSportingPerformance) return 8;
  if (hasEvent) return 6; // specific event/endurance
  if (hasReturnToSport || hasRecurringIssue) return 5;
  if (
    goals.includes("Lose weight or reduce body fat") ||
    goals.includes("Get stronger or build muscle")
  )
    return 4; // weight/strength/longevity
  return 2; // straightforward general fitness/maintenance
}

function calculatePTNeedScore(
  programmingSupportNeed,
  techniqueSupportNeed,
  accountabilityScore,
  goalComplexity,
) {
  if (
    isUnresolved(programmingSupportNeed) ||
    isUnresolved(techniqueSupportNeed) ||
    isUnresolved(accountabilityScore)
  ) {
    return { score: null, unresolved: true };
  }
  const score =
    0.35 * programmingSupportNeed +
    0.35 * techniqueSupportNeed +
    0.2 * accountabilityScore +
    0.1 * goalComplexity;
  const rounded = Math.round(score * 10) / 10;

  let band;
  if (rounded < 4) band = "LOW";
  else if (rounded < 6) band = "MODERATE";
  else if (rounded < 8) band = "HIGH";
  else band = "VERY HIGH";

  return { score: rounded, band: band, unresolved: false };
}

// Test it
const goalComplexity = calculateGoalComplexity(
  ["Improve my sporting performance"],
  false,
  false,
  false,
  true,
  false,
);
console.log("Goal Complexity:", goalComplexity);

const ptResult = calculatePTNeedScore(8, 8, 5.3, goalComplexity);
console.log("PT Need Result:", ptResult);
// ===== ANCILLARY SERVICE RULES =====

function determineClinicalService(
  clinicalSupportScore,
  clinicalBarrierToPrimaryGoal,
) {
  if (isUnresolved(clinicalSupportScore)) return { level: null, unresolved: true };

  let level;
  if (clinicalSupportScore <= 2) level = "NO_SERVICE";
  else if (clinicalSupportScore <= 4) level = "OPTIONAL";
  else if (clinicalSupportScore <= 6) level = "CONSIDER";
  else level = "RECOMMENDED";

  if (clinicalBarrierToPrimaryGoal) level = "ESSENTIAL_PREREQUISITE";

  return { level, unresolved: false };
}

function determineNutritionLevel(
  nutritionSupportScore,
  isWeightBodyFatPrimaryGoal,
) {
  if (isUnresolved(nutritionSupportScore)) return { level: null, unresolved: true };

  let level;
  if (nutritionSupportScore <= 2) level = "LEVEL_0";
  else if (nutritionSupportScore <= 4) level = "LEVEL_1";
  else if (nutritionSupportScore <= 6) level = "LEVEL_2";
  else if (nutritionSupportScore <= 8) level = "LEVEL_3";
  else level = "LEVEL_4";

  // Weight/body-fat primary goal + score >=4 forces minimum Level 2, Recommended
  if (isWeightBodyFatPrimaryGoal && nutritionSupportScore >= 4) {
    const levelNum = parseInt(level.split("_")[1]);
    if (levelNum < 2) level = "LEVEL_2";
    return { level, status: "RECOMMENDED", unresolved: false };
  }

  return { level, unresolved: false };
}

function determineRecoveryService(recoverySupportScore) {
  if (isUnresolved(recoverySupportScore))
    return { status: null, type: null, unresolved: true };

  let status;
  if (recoverySupportScore <= 3) status = "NO_SPECIFIC_INTERVENTION";
  else if (recoverySupportScore <= 6) status = "OCCASIONAL_ADVICE";
  else if (recoverySupportScore <= 8)
    status = "REGULAR_SUPPORT_POTENTIALLY_RECOMMENDED";
  else status = "INDIVIDUAL_REVIEW";

  // Type is NOT auto-mapped to massage from score alone — left for staff/further logic
  return { status, type: null, unresolved: false };
}

// Test all three
console.log("Clinical Service:", determineClinicalService(4.2, false));
console.log("Nutrition Level:", determineNutritionLevel(7.6, false));
console.log("Recovery Service:", determineRecoveryService(5.3));
// ===== VO2/METABOLIC, RMR, BODY COMPOSITION SERVICES =====

function determineVO2MetabolicService(inputs) {
  // inputs: hasEnduranceCardioGoal, hasEvent, highPerformanceFocus, highDataInterest, hasHyroxOrEnduranceGoal
  let strongSignals = 0;
  if (inputs.hasEnduranceCardioGoal) strongSignals++;
  if (inputs.hasEvent) strongSignals++;
  if (inputs.highPerformanceFocus) strongSignals++;
  if (inputs.highDataInterest) strongSignals++;
  if (inputs.hasHyroxOrEnduranceGoal) strongSignals++;

  let level;
  if (strongSignals >= 2) level = "HIGH";
  else if (strongSignals === 1) level = "MODERATE";
  else level = "LOW";

  let status;
  if (level === "HIGH") status = "RECOMMENDED";
  else if (level === "MODERATE") status = "IF_DESIRED";
  else status = "OMIT";

  return { level, status, strongSignals };
}

// BUG FOUND ON A REAL SUBMISSION (contact ZXzd4DoraKDkLFOgiG72): a client
// with goals=["Lose weight or reduce body fat"], Q13 (nutrition relevance)
// "Slightly" (score 3) and Q18 (objective data interest) "Nice to know"
// (score 2) got BOTH RMR and Deep Dive into VIP. Both functions below used
// to treat significantWeightBodyCompGoal/bodyCompositionImportant as
// sufficient on its own for MODERATE ("relevanceCount >= 1" / a plain OR),
// so the weight-loss goal alone triggered both, with zero corroboration
// from either data-relevant question - both of which were explicitly low,
// not just unresolved. That's exactly the "irrelevant service added just
// to make VIP bigger" case brief section 14 warns against: RMR and Deep
// Dive are both objective-measurement products, and a client who has
// explicitly told us (via Q18) that this kind of data isn't important to
// them shouldn't have either recommended off a goal flag alone.
// explicitLowDataInterest = Q18 answered at the bottom of its scale ("Not
// important"=0/"Nice to know"=2), not merely unresolved - genuinely not
// knowing (blank Q18) still allows a goal alone to reach MODERATE; being
// told "no" does not.
function determineRMRService(inputs) {
  // inputs: significantWeightBodyCompGoal, nutritionRelevance, objectiveDataInterest, explicitLowDataInterest
  let relevanceCount = 0;
  if (inputs.significantWeightBodyCompGoal) relevanceCount++;
  if (!isUnresolved(inputs.nutritionRelevance) && inputs.nutritionRelevance >= 6)
    relevanceCount++;
  if (
    !isUnresolved(inputs.objectiveDataInterest) &&
    inputs.objectiveDataInterest >= 6
  )
    relevanceCount++;

  let level;
  // High relevance requires ALL THREE together per the brief
  if (
    inputs.significantWeightBodyCompGoal &&
    !isUnresolved(inputs.nutritionRelevance) &&
    inputs.nutritionRelevance >= 6 &&
    !isUnresolved(inputs.objectiveDataInterest) &&
    inputs.objectiveDataInterest >= 6
  ) {
    level = "HIGH";
  } else if (inputs.explicitLowDataInterest) {
    // Can never reach here from the HIGH branch above (that requires
    // objectiveDataInterest >= 6, this requires it explicitly low), so
    // this only ever downgrades an otherwise-MODERATE result.
    level = "LOW";
  } else if (relevanceCount >= 1) {
    level = "MODERATE";
  } else {
    level = "LOW";
  }

  let status;
  if (level === "HIGH") status = "RECOMMENDED";
  else if (level === "MODERATE") status = "IF_DESIRED";
  else status = "OMIT";

  return { level, status };
}

function determineBodyCompositionService(inputs) {
  // inputs: bodyCompositionImportant, valuesMeasurableData, explicitLowDataInterest
  let level;
  if (inputs.bodyCompositionImportant && inputs.valuesMeasurableData) {
    level = "HIGH";
  } else if (inputs.explicitLowDataInterest) {
    level = "LOW";
  } else if (inputs.bodyCompositionImportant || inputs.valuesMeasurableData) {
    level = "MODERATE";
  } else {
    level = "LOW";
  }

  let status;
  if (level === "HIGH") status = "RECOMMENDED";
  else if (level === "MODERATE") status = "RECOMMENDED_OR_IF_DESIRED";
  else status = "OMIT";

  return { level, status };
}

// Test all three
console.log(
  "VO2/Metabolic:",
  determineVO2MetabolicService({
    hasEnduranceCardioGoal: true,
    hasEvent: true,
    highPerformanceFocus: true,
    highDataInterest: false,
    hasHyroxOrEnduranceGoal: false,
  }),
);

console.log(
  "RMR:",
  determineRMRService({
    significantWeightBodyCompGoal: true,
    nutritionRelevance: 8,
    objectiveDataInterest: 8,
  }),
);

console.log(
  "Body Composition:",
  determineBodyCompositionService({
    bodyCompositionImportant: true,
    valuesMeasurableData: true,
  }),
); // ===== PLAN TIER ASSIGNMENT =====
// Organizes all the services we've already determined into the four tier buckets

function assignPlanTiers(services) {
  // services = the bundle of results from all our service functions
  const tiers = {
    essentialPrerequisite: [],
    essentialCore: [],
    recommended: [],
    vip: [],
  };

  // Clinical
  if (services.clinical.level === "ESSENTIAL_PREREQUISITE") {
    tiers.essentialPrerequisite.push({
      service: "Clinical/Physio Assessment",
      reason: "Clinical barrier to primary goal",
    });
  } else if (services.clinical.level === "RECOMMENDED") {
    tiers.recommended.push({ service: "Clinical/Physio Assessment" });
  } else if (services.clinical.level === "CONSIDER") {
    tiers.vip.push({
      service: "Clinical/Physio Assessment",
      type: "VIP_IF_DESIRED",
    });
  }

  // Nutrition
  if (services.nutrition.status === "RECOMMENDED") {
    tiers.recommended.push({
      service: `Nutrition Support (${services.nutrition.level})`,
    });
  } else if (
    services.nutrition.level === "LEVEL_3" ||
    services.nutrition.level === "LEVEL_4"
  ) {
    tiers.recommended.push({
      service: `Nutrition Support (${services.nutrition.level})`,
    });
  } else if (
    services.nutrition.level === "LEVEL_1" ||
    services.nutrition.level === "LEVEL_2"
  ) {
    tiers.vip.push({
      service: `Nutrition Support (${services.nutrition.level})`,
      type: "VIP_IF_DESIRED",
    });
  }

  // Recovery
  if (
    services.recovery.status === "INDIVIDUAL_REVIEW" ||
    services.recovery.status === "REGULAR_SUPPORT_POTENTIALLY_RECOMMENDED"
  ) {
    tiers.recommended.push({ service: "Recovery Support" });
  } else if (services.recovery.status === "OCCASIONAL_ADVICE") {
    tiers.vip.push({
      service: "Recovery Support (occasional advice)",
      type: "VIP_IF_DESIRED",
    });
  }

  // VO2/Metabolic
  if (services.vo2.status === "RECOMMENDED") {
    tiers.recommended.push({ service: "VO2/Metabolic Testing" });
  } else if (services.vo2.status === "IF_DESIRED") {
    tiers.vip.push({
      service: "VO2/Metabolic Testing",
      type: "VIP_IF_DESIRED",
    });
  }

  // RMR
  if (services.rmr.status === "RECOMMENDED") {
    tiers.recommended.push({ service: "RMR Testing" });
  } else if (services.rmr.status === "IF_DESIRED") {
    tiers.vip.push({ service: "RMR Testing", type: "VIP_IF_DESIRED" });
  }

  // Body Composition
  if (services.bodyComp.status === "RECOMMENDED") {
    tiers.recommended.push({ service: "Body Composition Baseline" });
  } else if (services.bodyComp.status === "RECOMMENDED_OR_IF_DESIRED") {
    tiers.vip.push({
      service: "Body Composition Baseline",
      type: "VIP_IF_DESIRED",
    });
  }

  return tiers;
}

// Test it using everything we've already calculated
const allServices = {
  clinical: { level: "CONSIDER" },
  nutrition: { level: "LEVEL_3", status: undefined },
  recovery: { status: "OCCASIONAL_ADVICE" },
  vo2: { status: "RECOMMENDED" },
  rmr: { status: "RECOMMENDED" },
  bodyComp: { status: "RECOMMENDED" },
};

const planTiers = assignPlanTiers(allServices);
console.log("Plan Tiers:", JSON.stringify(planTiers, null, 2));
// ===== PRICING CATALOGUE (CONFIGURABLE - EDIT PRICES HERE, NEVER IN LOGIC) =====

const priceCatalogue = {
  bronze_membership: {
    name: "Bronze membership - 4 sessions/month",
    price: 46,
    billing: "RECURRING_MONTHLY",
  },
  silver_membership: {
    name: "Silver membership - 8 sessions/month",
    price: 84,
    billing: "RECURRING_MONTHLY",
  },
  gold_membership: {
    name: "Gold membership - 12 sessions/month",
    price: 116,
    billing: "RECURRING_MONTHLY",
  },
  platinum_membership: {
    name: "Platinum membership - 16 sessions/month",
    price: 137,
    billing: "RECURRING_MONTHLY",
  },
  unlimited_membership: {
    name: "Unlimited membership",
    price: 160,
    billing: "RECURRING_MONTHLY",
  },
  academy: {
    name: "Academy - 1 session/week",
    price: 46,
    billing: "RECURRING_MONTHLY",
  },
  initial_1to1_assessment: {
    name: "Initial 1:1 Coaching Assessment - 90 min",
    price: 99,
    billing: "ONE_OFF",
    mandatoryPrerequisite: true,
  },
  coaching_1x_week: {
    name: "1:1 Coaching Package - 1x/week, 48 sessions/year",
    price: 220,
    billing: "RECURRING_MONTHLY",
  },
  coaching_2x_week: {
    name: "1:1 Coaching Package - 2x/week, 48 weeks/year",
    price: 440,
    billing: "RECURRING_MONTHLY",
  },
  payg_1to1: {
    name: "PAYG 1:1 Coaching - 60 min",
    price: 60,
    billing: "ONE_OFF",
  },
  pt_programme_review: {
    name: "1:1 PT/Coaching Programme Review - 60 min",
    price: 60,
    billing: "ONE_OFF",
  },
};

// ===== PRICING FUNCTIONS =====

function getPrice(productId) {
  const product = priceCatalogue[productId];
  if (!product) return null;
  return { name: product.name, price: product.price, billing: product.billing };
}

function calculatePackageTotal(productIds) {
  let recurringMonthlyTotal = 0;
  let oneOffTotal = 0;
  const lineItems = [];

  for (const id of productIds) {
    const product = priceCatalogue[id];
    if (!product) continue;

    lineItems.push({
      name: product.name,
      price: product.price,
      billing: product.billing,
    });

    if (product.billing === "RECURRING_MONTHLY") {
      recurringMonthlyTotal += product.price;
    } else if (product.billing === "ONE_OFF") {
      oneOffTotal += product.price;
    }
  }

  return {
    lineItems,
    recurringMonthlyTotal,
    oneOffTotal,
  };
}

// Test it: a package with a membership + mandatory initial assessment + ongoing 1:1 coaching
const testPackage = calculatePackageTotal([
  "gold_membership",
  "initial_1to1_assessment",
  "coaching_1x_week",
]);
console.log("Test Package:", JSON.stringify(testPackage, null, 2));
// ===== PHASE 3: WORKED EXAMPLE A TEST =====
// "Healthy longevity client" - capable, low support need, general health/longevity focus
// Expected: Best class = Hybrid, PT = Low, Clinical = Not indicated

console.log("\n=== WORKED EXAMPLE A: Healthy Longevity Client ===");

// Simulate a person who is fairly capable, training somewhat already, low support needs
const personA = {
  q3Answer: "3–4 times per week",
  programmingSupportNeed: scoreProgrammingSupportNeed("Fairly confident"), // low need = 3
  techniqueSupportNeed: scoreTechniqueSupportNeed("Quite confident"), // low need = 3
  consistencySupportNeed: scoreConsistencySupportNeed(
    "Quite easy – usually consistent",
  ), // 3
  desiredAccountabilityLevel: scoreDesiredAccountabilityLevel(
    "Occasional check-ins",
  ), // 3
  currentClinicalImpact: scoreCurrentClinicalImpact("Not at all"), // 0
  recurrenceConcern: scoreRecurrenceConcern("No"), // 0
  goals: [
    "Improve my general health and fitness",
    "Stay fit, strong and independent as I get older",
  ],
};

// Run through Coaching + Accountability axes
const coachA = calculateCoachingAxis(
  personA.programmingSupportNeed,
  personA.techniqueSupportNeed,
);
const accA = calculateAccountabilityAxis(
  personA.consistencySupportNeed,
  personA.desiredAccountabilityLevel,
);
const clinA = calculateClinicalSupportAxis(
  personA.currentClinicalImpact,
  personA.recurrenceConcern,
  0,
);

console.log(
  "Coaching:",
  coachA,
  "| Accountability:",
  accA,
  "| Clinical:",
  clinA,
);

// Class scoring
const hybridA = calculateHybridScore({
  goals: personA.goals,
  longevityFocus: true,
  eventOrCompetition: false,
  futureInjuryRisk: false,
  q21_Strength: false,
  q21_Cardiovascular: true,
  q21_Independence: true,
  q21_BodyComposition: false,
  balancedTrainingNeed: true,
  q5Answer: "2 sessions per week",
  strengthAndCardioRelevant: false,
  performanceFocusScore: 2,
  techniqueSupportNeed: 3,
  existingStrengthCardioGap: false,
  existingCardioStrengthGap: false,
  preferredStyle: "MIXED",
});

const liftA = calculateLiftScore({
  goals: personA.goals,
  longevityFocus: true,
  futureInjuryRisk: false,
  recurrencePrevention: false,
  eventOrCompetition: false,
  q21_Strength: false,
  q21_Independence: true,
  q21_InjuryPrevention: false,
  q21_BodyComposition: false,
  strengthTrainingGap: false,
  performanceFocusScore: 2,
  techniqueSupportNeed: 3,
  preferredStyle: "MIXED",
});

console.log("Hybrid Score:", hybridA, "| Lift Score:", liftA);
console.log(
  "EXPECTED: Hybrid should score highest (Best: Hybrid; Complementary: Lift)",
);

const goalComplexA = calculateGoalComplexity(
  personA.goals,
  false,
  false,
  false,
  false,
  false,
);
const ptA = calculatePTNeedScore(
  personA.programmingSupportNeed,
  personA.techniqueSupportNeed,
  accA.score,
  goalComplexA,
);
console.log("PT Need:", ptA, "| EXPECTED: LOW band");

const clinicalServiceA = determineClinicalService(clinA.score, false);
console.log(
  "Clinical Service:",
  clinicalServiceA,
  "| EXPECTED: NO_SERVICE or OPTIONAL (Not indicated)",
);

// ===== WORKED EXAMPLE B: Sedentary Longevity Beginner =====
// Expected: Foundation Starting Override triggers (Best Starting Match: Foundation, Future Match: Hybrid)
// Expected: High/very high PT need initially

console.log("\n=== WORKED EXAMPLE B: Sedentary Longevity Beginner ===");

const personB = {
  q3Answer: "Very little or no structured exercise",
  programmingSupportNeed: scoreProgrammingSupportNeed("Not confident at all"), // 8
  techniqueSupportNeed: scoreTechniqueSupportNeed("Not confident at all"), // 10
  consistencySupportNeed: scoreConsistencySupportNeed(
    "Very difficult – much more likely if someone expects me",
  ), // 10
  desiredAccountabilityLevel: scoreDesiredAccountabilityLevel("High level"), // 8
  currentClinicalImpact: scoreCurrentClinicalImpact("Not at all"), // 0
  recurrenceConcern: scoreRecurrenceConcern("No"), // 0
  goals: [
    "Stay fit, strong and independent as I get older",
    "Exercise with more confidence",
  ],
};

const accB = calculateAccountabilityAxis(
  personB.consistencySupportNeed,
  personB.desiredAccountabilityLevel,
);
console.log("Accountability Axis:", accB, "| EXPECTED: High");

// Foundation score - should be high given low activity + low confidence + confidence goal
const foundationB = calculateFoundationScore({
  q3Answer: personB.q3Answer,
  programmingSupportNeed: personB.programmingSupportNeed,
  techniqueSupportNeed: personB.techniqueSupportNeed,
  goals: personB.goals,
  q21_Balance: true,
  q21_Independence: true,
  q22_None: true,
  regularStrengthTraining: false,
  performanceFocusScore: 0,
  postnatalReturnToExercise: false,
});
console.log("Foundation Score:", foundationB);

// Now test the override condition directly
const overrideCheckB = determineBestMatch(
  { foundation: foundationB, lift: 2, hybrid: 5, hyrox: 0 },
  {
    techniqueSupportNeed: personB.techniqueSupportNeed,
    q3Answer: personB.q3Answer,
    foundationScore: foundationB,
  },
);
console.log("Best Match Result:", overrideCheckB);
console.log(
  "EXPECTED: Foundation Starting Override should apply (technique >=8, low activity, foundation >=10)",
);

// PT need check - expected HIGH/VERY HIGH
const goalComplexB = calculateGoalComplexity(
  personB.goals,
  false,
  false,
  false,
  false,
  false,
);
const ptB = calculatePTNeedScore(
  personB.programmingSupportNeed,
  personB.techniqueSupportNeed,
  accB.score,
  goalComplexB,
);
console.log("PT Need:", ptB, "| EXPECTED: HIGH or VERY HIGH band");
// ===== WORKED EXAMPLE D: Marathon Runner with Achilles Problem =====
// Expected: Best class = Lift (not conditioning-focused, since cardio is already substantial)
// Expected: Clinical = Essential_Prerequisite (Achilles is a barrier to primary goal)
// Expected: PT = routine low

console.log(
  "\n=== WORKED EXAMPLE D: Marathon Runner with Achilles Problem ===",
);

const personD = {
  goals: [
    "Improve my sporting performance",
    "Prepare for a sport, event or physical challenge",
  ],
  currentClinicalImpact: scoreCurrentClinicalImpact("Significantly"), // 8
  recurrenceConcern: scoreRecurrenceConcern(
    "I'm concerned increasing exercise could make it worse",
  ), // 9
  performanceFocusScore: 9, // very high, marathon runner
  q3Answer: "5+ times per week", // already training heavily (running)
};

// Clinical axis - should be high
const clinD = calculateClinicalSupportAxis(
  personD.currentClinicalImpact,
  personD.recurrenceConcern,
  0,
);
console.log("Clinical Axis:", clinD, "| EXPECTED: High");

// Clinical service - Achilles IS a barrier to primary goal (marathon performance), so ESSENTIAL_PREREQUISITE
const clinicalServiceD = determineClinicalService(clinD.score, true); // true = clinicalBarrierToPrimaryGoal
console.log(
  "Clinical Service:",
  clinicalServiceD,
  "| EXPECTED: ESSENTIAL_PREREQUISITE",
);

// Lift score - should win because cardio is already substantial, strength is the gap
const liftD = calculateLiftScore({
  goals: personD.goals,
  longevityFocus: false,
  futureInjuryRisk: true,
  recurrencePrevention: true,
  eventOrCompetition: true,
  q21_Strength: false,
  q21_Independence: false,
  q21_InjuryPrevention: true,
  q21_BodyComposition: false,
  strengthTrainingGap: true, // runner likely lacks strength work
  performanceFocusScore: personD.performanceFocusScore,
  techniqueSupportNeed: 2,
  preferredStyle: "STRENGTH",
});

const hyroxD = calculateHyroxScore({
  specificHyroxGoal: false,
  eventOrCompetition: true,
  goals: personD.goals,
  longevityFocus: false,
  q21_Cardiovascular: false,
  q21_Independence: false,
  q21_BodyComposition: false,
  q3Answer: personD.q3Answer,
  techniqueSupportNeed: 2,
  performanceFocusScore: personD.performanceFocusScore,
  q17SpecificallyHyrox: false,
  preferredStyle: "STRENGTH",
});

console.log("Lift Score:", liftD, "| HYROX Score:", hyroxD);
console.log(
  "EXPECTED: Lift should score highest (strength gap fills the missing piece, not more conditioning)",
);

// PT need - expected LOW despite high clinical/performance relevance
const goalComplexD = calculateGoalComplexity(
  personD.goals,
  false,
  false,
  true,
  true,
  false,
);
const ptD = calculatePTNeedScore(3, 2, 5, goalComplexD); // low programming/technique need - experienced runner
console.log(
  "PT Need:",
  ptD,
  "| EXPECTED: LOW (clinical/performance relevance doesn't force PT)",
);
// ===== MASTER ORCHESTRATOR FUNCTION =====
// Takes raw answers, runs them through the entire engine, returns the full result

// PENDING CLIENT CONFIRMATION: clinicalBarrierToPrimaryGoal is derived from
// Q10 (Current Clinical Impact) - true when the client says a clinical/pain
// issue is currently affecting them at this level. Q10 asks directly
// whether pain or injury is currently affecting their ability to exercise,
// the closest existing signal to "a clinical barrier to the primary goal" -
// but this exact mapping hasn't been confirmed against the brief's own
// definition of that term yet.
const CLINICAL_BARRIER_Q10_ANSWERS = ["Significantly", "Very significantly"];

function runFullAssessment(answers, flags = {}) {
  // Step 1: Convert raw answers to scores
  const scores = {
    q3: scoreCurrentActivity(answers.q3),
    q4: scoreTrainingContribution(answers.q4),
    q5: scoreONETEQFrequency(answers.q5),
    q6: scoreProgrammingSupportNeed(answers.q6),
    q7: scoreTechniqueSupportNeed(answers.q7),
    q8: scoreConsistencySupportNeed(answers.q8),
    q9: scoreDesiredAccountabilityLevel(answers.q9),
    q10: scoreCurrentClinicalImpact(answers.q10),
    q11: scoreRecurrenceConcern(answers.q11),
    q13: scoreNutritionRelevance(answers.q13),
    q14: scoreNutritionCurrentSupportNeed(answers.q14),
    q15: scoreDesiredNutritionSupport(answers.q15),
    q16: scorePerformanceImportance(answers.q16),
    q17: scoreEventPerformanceRelevance(answers.q17),
    q18: scoreObjectiveDataInterest(answers.q18),
    q19: scoreRecoverySupportNeed(answers.q19),
    q20: scoreDesiredRecoverySupport(answers.q20),
  };

  // Step 2: Apply Q12 modifier to clinical score
  const q12Result = scoreClinicalModifier(answers.q10, scores.q10, answers.q12);

  // Step 3: Calculate the 7 axes
  const axes = {
    training: calculateTrainingAxis(scores.q4),
    coaching: calculateCoachingAxis(scores.q6, scores.q7),
    accountability: calculateAccountabilityAxis(scores.q8, scores.q9),
    clinicalSupport: calculateClinicalSupportAxis(
      scores.q10,
      scores.q11,
      q12Result.modifier,
    ),
    nutritionSupport: calculateNutritionSupportAxis(
      scores.q13,
      scores.q14,
      scores.q15,
    ),
    performanceFocus: calculatePerformanceFocusAxis(
      scores.q16,
      scores.q17,
      scores.q18,
    ),
    recoverySupport: calculateRecoverySupportAxis(scores.q19, scores.q20),
  };

  // Step 4: Ancillary services
  // clinicalBarrierToPrimaryGoal and isWeightBodyFatPrimaryGoal used to be
  // read from answers.clinicalBarrierToPrimaryGoal/answers.isWeightBodyFatPrimaryGoal,
  // but nothing has ever set those properties on the answers object (it
  // only ever contains q3-q20), so both were always false in production.
  // Derived properly now: the weight/body-fat one from the client's actual
  // stated goals; the clinical one from Q10 (see CLINICAL_BARRIER_Q10_ANSWERS
  // above - pending client confirmation).
  const clinicalBarrierToPrimaryGoal = CLINICAL_BARRIER_Q10_ANSWERS.includes(
    normalizeAnswer(answers.q10),
  );
  const isWeightBodyFatPrimaryGoal = (flags.goals || []).includes(
    "Lose weight or reduce body fat",
  );

  const services = {
    clinical: determineClinicalService(
      axes.clinicalSupport.score,
      clinicalBarrierToPrimaryGoal,
    ),
    nutrition: determineNutritionLevel(
      axes.nutritionSupport.score,
      isWeightBodyFatPrimaryGoal,
    ),
    recovery: determineRecoveryService(axes.recoverySupport.score),
  };

  return {
    rawScores: scores,
    axes: axes,
    services: services,
    engineVersion: "ONETEQ_RE_V3.0",
    timestamp: new Date().toISOString(),
  };
}

// Quick test with Worked Example A's answers
const fullResultA = runFullAssessment({
  q3: "3–4 times per week",
  q4: "3 sessions per week",
  q5: "2 sessions per week",
  q6: "Fairly confident",
  q7: "Quite confident",
  q8: "Quite easy – usually consistent",
  q9: "Occasional check-ins",
  q10: "Not at all",
  q11: "No",
  q12: "Not applicable",
  q13: "Moderately",
  q14: "Quite confident",
  q15: "Occasional guidance",
  q16: "Slightly",
  q17: "No",
  q18: "Nice to know",
  q19: "Quite well – occasional issues",
  q20: "Occasional advice/support",
});
console.log("\n=== FULL ORCHESTRATOR TEST ===");
console.log(JSON.stringify(fullResultA, null, 2));
// ===== EXTEND ORCHESTRATOR: ADD CLASS MATCHING + PT =====

function runFullAssessmentComplete(answers, flags) {
  const base = runFullAssessment(answers, flags);

  // Class scoring needs goals + Q21/Q22 flags, passed in separately as "flags"
  const classScores = {
    foundation: calculateFoundationScore({
      q3Answer: answers.q3,
      programmingSupportNeed: base.rawScores.q6,
      techniqueSupportNeed: base.rawScores.q7,
      goals: flags.goals,
      q21_Balance: flags.q21_Balance || false,
      q21_Independence: flags.q21_Independence || false,
      q22_None: flags.q22_None || false,
      regularStrengthTraining: flags.regularStrengthTraining || false,
      performanceFocusScore: base.axes.performanceFocus.score,
      postnatalReturnToExercise: flags.postnatalReturnToExercise || false,
    }),
    lift: calculateLiftScore({
      goals: flags.goals,
      longevityFocus: flags.longevityFocus || false,
      futureInjuryRisk: flags.futureInjuryRisk || false,
      recurrencePrevention: flags.recurrencePrevention || false,
      eventOrCompetition: flags.eventOrCompetition || false,
      q21_Strength: flags.q21_Strength || false,
      q21_Independence: flags.q21_Independence || false,
      q21_InjuryPrevention: flags.q21_InjuryPrevention || false,
      q21_BodyComposition: flags.q21_BodyComposition || false,
      strengthTrainingGap: flags.strengthTrainingGap || false,
      performanceFocusScore: base.axes.performanceFocus.score,
      techniqueSupportNeed: base.rawScores.q7,
      preferredStyle: flags.preferredStyle || "NONE",
    }),
    hybrid: calculateHybridScore({
      goals: flags.goals,
      longevityFocus: flags.longevityFocus || false,
      eventOrCompetition: flags.eventOrCompetition || false,
      futureInjuryRisk: flags.futureInjuryRisk || false,
      q21_Strength: flags.q21_Strength || false,
      q21_Cardiovascular: flags.q21_Cardiovascular || false,
      q21_Independence: flags.q21_Independence || false,
      q21_BodyComposition: flags.q21_BodyComposition || false,
      balancedTrainingNeed: flags.balancedTrainingNeed || false,
      q5Answer: answers.q5,
      strengthAndCardioRelevant: flags.strengthAndCardioRelevant || false,
      performanceFocusScore: base.axes.performanceFocus.score,
      techniqueSupportNeed: base.rawScores.q7,
      existingStrengthCardioGap: flags.existingStrengthCardioGap || false,
      existingCardioStrengthGap: flags.existingCardioStrengthGap || false,
      preferredStyle: flags.preferredStyle || "NONE",
    }),
    hyrox: calculateHyroxScore({
      specificHyroxGoal: flags.specificHyroxGoal || false,
      eventOrCompetition: flags.eventOrCompetition || false,
      goals: flags.goals,
      longevityFocus: flags.longevityFocus || false,
      q21_Cardiovascular: flags.q21_Cardiovascular || false,
      q21_Independence: flags.q21_Independence || false,
      q21_BodyComposition: flags.q21_BodyComposition || false,
      q3Answer: answers.q3,
      techniqueSupportNeed: base.rawScores.q7,
      performanceFocusScore: base.axes.performanceFocus.score,
      q17SpecificallyHyrox: flags.q17SpecificallyHyrox || false,
      preferredStyle: flags.preferredStyle || "NONE",
    }),
  };

  const flooredScores = floorScores(classScores);
  const modifiedScores = applyTrainingGapModifiers(
    flooredScores,
    flags.primaryTrainingGap || "NONE",
  );
  const classMatch = determineBestMatch(modifiedScores, {
    techniqueSupportNeed: base.rawScores.q7,
    programmingSupportNeed: base.rawScores.q6,
    q3Answer: answers.q3,
    foundationScore: modifiedScores.foundation,
  });

  const goalComplexity = calculateGoalComplexity(
    flags.goals,
    flags.hasRecurringIssue || false,
    flags.hasReturnToSport || false,
    flags.hasEvent || false,
    flags.hasSportingPerformance || false,
    flags.hasComplexPerformanceTarget || false,
  );
  const ptNeed = calculatePTNeedScore(
    base.rawScores.q6,
    base.rawScores.q7,
    base.axes.accountability.score,
    goalComplexity,
  );

  return { ...base, classScores: modifiedScores, classMatch, ptNeed };
}

// Test with Worked Example A answers again, now with class flags
const completeResultA = runFullAssessmentComplete(
  {
    q3: "3–4 times per week",
    q4: "3 sessions per week",
    q5: "2 sessions per week",
    q6: "Fairly confident",
    q7: "Quite confident",
    q8: "Quite easy – usually consistent",
    q9: "Occasional check-ins",
    q10: "Not at all",
    q11: "No",
    q12: "Not applicable",
    q13: "Moderately",
    q14: "Quite confident",
    q15: "Occasional guidance",
    q16: "Slightly",
    q17: "No",
    q18: "Nice to know",
    q19: "Quite well – occasional issues",
    q20: "Occasional advice/support",
  },
  {
    goals: [
      "Improve my general health and fitness",
      "Stay fit, strong and independent as I get older",
    ],
    longevityFocus: true,
    q21_Cardiovascular: true,
    q21_Independence: true,
    balancedTrainingNeed: true,
    preferredStyle: "MIXED",
  },
);
console.log("\n=== COMPLETE ORCHESTRATOR TEST ===");
console.log("Class Match:", completeResultA.classMatch);
console.log("PT Need:", completeResultA.ptNeed);
// ===== FINAL EXTENSION: ADD PRICING TO THE ORCHESTRATOR =====

// Section 15 of the brief: membership follows the client's agreed session
// frequency, suggest the lowest suitable tier, never fill sessions to sell
// more. Section 11: desired ONETEQ frequency (Q5) constrains
// recommendations. This is a direct mapping, not a floor - the class
// match decides *which* class, Q5 alone decides *how many sessions*, and
// nothing ever upgrades past what Q5 indicates.
// "I'd like you to recommend this" is an explicit punt (same idea as
// "Recommend for me"/"Unsure" elsewhere in the engine) - null here, same
// as a genuinely blank/unrecognized answer, so no membership is guessed
// and it's flagged for staff discussion instead.
const Q5_FREQUENCY_TO_MEMBERSHIP_TIER = {
  "Occasional, less than weekly": "bronze_membership",
  "1 session per week": "bronze_membership",
  "2 sessions per week": "silver_membership",
  "3 sessions per week": "gold_membership",
  "4+ sessions per week": "platinum_membership",
  "I'd like you to recommend this": null,
};

function buildRecommendedPackage(ptNeed, answers) {
  const productIds = [];

  const membershipTier = lookupAnswer(Q5_FREQUENCY_TO_MEMBERSHIP_TIER, answers.q5);
  const membershipUnresolved = !membershipTier;
  if (membershipTier) {
    productIds.push(membershipTier);
  }

  // Add PT/coaching based on need band
  if (ptNeed.band === "HIGH" || ptNeed.band === "VERY HIGH") {
    productIds.push("initial_1to1_assessment");
    productIds.push("coaching_1x_week");
  } else if (ptNeed.band === "MODERATE") {
    productIds.push("initial_1to1_assessment");
    productIds.push("payg_1to1");
  }
  // LOW band = no PT added automatically

  const packageResult = calculatePackageTotal(productIds);
  return { ...packageResult, membershipUnresolved };
}

function runFullAssessmentWithPricing(answers, flags) {
  const complete = runFullAssessmentComplete(answers, flags);
  const packageResult = buildRecommendedPackage(complete.ptNeed, answers);
  const tieredPackages = buildTieredPackages(complete, answers, flags);

  return { ...complete, recommendedPackage: packageResult, tieredPackages };
}

// NOTE: the end-to-end test call for runFullAssessmentWithPricing lives
// further down in this file (see "FINAL END-TO-END TEST" near the bottom),
// not here - it now depends on v3Catalogue and the v3-based pricing
// functions (getCoachingPricing/getNutritionPricing/getPhysioPricing,
// calculateV3PackageTotal), all defined later in the file, so calling it
// here would hit them before their const/function bodies are initialised.
// ===== V3 PRICING CATALOGUE (EXPANDED - matches brief exactly) =====

const v3Catalogue = {
  // Core memberships (30.2)
  bronze_membership: {
    name: "Bronze - 4 sessions/month",
    price: 46,
    billing: "RECURRING_MONTHLY",
    category: "membership",
    active: true,
  },
  silver_membership: {
    name: "Silver - 8 sessions/month",
    price: 84,
    billing: "RECURRING_MONTHLY",
    category: "membership",
    active: true,
  },
  gold_membership: {
    name: "Gold - 12 sessions/month",
    price: 116,
    billing: "RECURRING_MONTHLY",
    category: "membership",
    active: true,
  },
  platinum_membership: {
    name: "Platinum - 16 sessions/month",
    price: 137,
    billing: "RECURRING_MONTHLY",
    category: "membership",
    active: true,
  },
  unlimited_membership: {
    name: "Unlimited",
    price: 160,
    billing: "RECURRING_MONTHLY",
    category: "membership",
    active: true,
  },

  // 1:1 Coaching (30.3)
  initial_assessment: {
    name: "Initial Assessment",
    price: 99,
    billing: "ONE_OFF",
    category: "coaching",
    active: true,
  },
  coaching_technical_programming: {
    name: "90-min Technical + Programming",
    price: 90,
    billing: "ONE_OFF",
    category: "coaching",
    active: true,
  },
  coaching_1x_week: {
    name: "1:1 Coaching - 1x/week",
    price: 220,
    billing: "RECURRING_MONTHLY",
    category: "coaching",
    active: true,
  },
  coaching_2x_week: {
    name: "1:1 Coaching - 2x/week",
    price: 440,
    billing: "RECURRING_MONTHLY",
    category: "coaching",
    active: true,
  },
  payg_1to1: {
    name: "PAYG 1:1 Coaching",
    price: 60,
    billing: "ONE_OFF",
    category: "coaching",
    active: true,
  },
  programme_review: {
    name: "Programme Review",
    price: 60,
    billing: "ONE_OFF",
    category: "coaching",
    active: true,
  },

  // Nutrition (30.4)
  nutrition_app_support: {
    name: "App Support",
    price: 25,
    billing: "RECURRING_MONTHLY",
    category: "nutrition",
    active: true,
  },
  nutrition_essentials: {
    name: "Nutrition Essentials",
    price: 125,
    billing: "ONE_OFF",
    category: "nutrition",
    active: true,
  },
  nutrition_transform: {
    name: "Nutrition Transform",
    price: 250,
    billing: "ONE_OFF",
    category: "nutrition",
    active: true,
  },
  nutrition_full_platter: {
    name: "Nutrition Full Platter",
    price: 500,
    billing: "ONE_OFF",
    category: "nutrition",
    active: true,
  },
  nutrition_followup: {
    name: "Nutrition Follow-up (add-on)",
    price: 50,
    billing: "ONE_OFF",
    category: "nutrition_addon",
    active: true,
  },
  nutrition_family: {
    name: "Family Package (add-on)",
    price: 40,
    billing: "ONE_OFF",
    category: "nutrition_addon",
    active: true,
  },
  nutrition_high_performance: {
    name: "High Performance Package (add-on)",
    price: 40,
    billing: "ONE_OFF",
    category: "nutrition_addon",
    active: true,
  },

  // Physio (30.5)
  physio_initial: {
    name: "Physio Initial",
    price: 80,
    discountedPrice: 72,
    billing: "ONE_OFF",
    category: "clinical",
    active: true,
  },
  physio_followup: {
    name: "Physio Follow-up",
    price: 63,
    discountedPrice: 56.7,
    billing: "ONE_OFF",
    category: "clinical",
    active: true,
  },
  director_consultation: {
    name: "Director Consultation/Assessment",
    price: 160,
    billing: "ONE_OFF",
    category: "clinical_addon",
    active: true,
  },

  // Recovery/Testing (30.6)
  sports_massage: {
    name: "Sports Massage 45 min",
    price: 55,
    billing: "ONE_OFF",
    category: "recovery",
    active: true,
  },
  vo2_metabolic: {
    name: "VO2/Metabolic Performance",
    price: 100,
    billing: "ONE_OFF",
    category: "testing",
    active: true,
  },
  deep_dive: {
    name: "Deep Dive",
    price: 140,
    billing: "ONE_OFF",
    category: "testing",
    active: true,
  },
  endurance_metabolic: {
    name: "Endurance Metabolic Performance",
    price: 140,
    billing: "ONE_OFF",
    category: "testing",
    active: true,
  },
  rmr_test: {
    name: "RMR",
    price: 75,
    billing: "ONE_OFF",
    category: "testing",
    active: true,
  },
  progress_checkin: {
    name: "Progress Check-in",
    price: 75,
    billing: "ONE_OFF",
    category: "future_optional",
    active: true,
  },
};

console.log(
  "V3 Catalogue loaded with",
  Object.keys(v3Catalogue).length,
  "products",
);
console.log(JSON.stringify(v3Catalogue.silver_membership, null, 2));
// ===== 30.3: PT/COACHING PRICING BY TIER =====

function getCoachingPricing(ptBand, tier) {
  // tier = "essential" | "recommended" | "vip"
  const items = [];

  if (ptBand === "LOW") {
    if (tier === "vip") items.push("payg_1to1"); // If Desired only
    // essential/recommended: no ongoing 1:1
  } else if (ptBand === "MODERATE") {
    if (tier === "recommended") items.push("coaching_technical_programming");
    if (tier === "vip") items.push("coaching_technical_programming"); // staff-configurable base
  } else if (ptBand === "HIGH" || ptBand === "VERY HIGH") {
    if (tier === "essential") items.push("initial_assessment");
    if (tier === "recommended") {
      items.push("initial_assessment");
      items.push("coaching_1x_week");
    }
    if (tier === "vip") {
      items.push("initial_assessment");
      items.push("coaching_2x_week");
    }
  }

  return items;
}

// Test: HIGH PT need, Recommended tier - should be Initial Assessment + 1x/week
const testItems = getCoachingPricing("HIGH", "recommended");
console.log("HIGH/Recommended coaching items:", testItems);
console.log(
  "EXPECTED: initial_assessment + coaching_1x_week (per acceptance test 30.10.4)",
);
// ===== 30.4: NUTRITION PRICING BY TIER =====

function getNutritionPricing(
  nutritionLevel,
  tier,
  isWeightBodyFatGoal,
  nutritionScore,
) {
  // nutritionLevel = "LEVEL_0" | "LEVEL_1" | "LEVEL_2" | "LEVEL_3" | "LEVEL_4"
  const items = [];
  const levelNum = parseInt(nutritionLevel.split("_")[1]);

  const tierMap = {
    0: { essential: null, recommended: null, vip: "nutrition_app_support" },
    1: {
      essential: null,
      recommended: "nutrition_app_support",
      vip: "nutrition_essentials",
    },
    2: {
      essential: "nutrition_app_support",
      recommended: "nutrition_essentials",
      vip: "nutrition_transform",
    },
    3: {
      essential: "nutrition_essentials",
      recommended: "nutrition_transform",
      vip: "nutrition_full_platter",
    },
    4: {
      essential: "nutrition_essentials",
      recommended: "nutrition_transform",
      vip: "nutrition_full_platter",
    },
  };

  let product = tierMap[levelNum][tier];

  // Weight/body-fat goal override: minimum £125 Essentials if score >= 4
  if (isWeightBodyFatGoal && nutritionScore >= 4) {
    if (!product || product === "nutrition_app_support") {
      product = "nutrition_essentials";
    }
  }

  if (product) items.push(product);
  return items;
}

// Test: weight-loss goal, score 5 (Level 2), Essential tier
// Without override, Level 2 Essential = app_support only. With override, must be at least Essentials.
const testNutrition = getNutritionPricing("LEVEL_2", "essential", true, 5);
console.log("Weight-goal override test:", testNutrition);
console.log("EXPECTED: nutrition_essentials (forced minimum, not app_support)");
// ===== 30.5: PHYSIO PRICING WITH DISCOUNT LOGIC =====

function getPhysioPricing(productId, hasQualifyingMembershipOrCoaching) {
  const catalogueItem = v3Catalogue[productId];
  if (!catalogueItem) return null;

  const price =
    hasQualifyingMembershipOrCoaching && catalogueItem.discountedPrice
      ? catalogueItem.discountedPrice
      : catalogueItem.price;

  return {
    name: catalogueItem.name,
    price: price,
    discountApplied:
      hasQualifyingMembershipOrCoaching && !!catalogueItem.discountedPrice,
  };
}

// Test 1: Physio initial, WITH a Gold membership (qualifies for discount)
const physioWithDiscount = getPhysioPricing("physio_initial", true);
console.log("Physio Initial WITH membership:", physioWithDiscount);
console.log("EXPECTED: price 72, discountApplied true");

// Test 2: Physio initial, NO membership (standard price)
const physioNoDiscount = getPhysioPricing("physio_initial", false);
console.log("Physio Initial WITHOUT membership:", physioNoDiscount);
console.log("EXPECTED: price 80, discountApplied false");

// Test 3: Director Consultation - must NEVER get a discount (per brief)
const directorConsult = getPhysioPricing("director_consultation", true);
console.log("Director Consultation (with membership):", directorConsult);
console.log(
  "EXPECTED: price 160, discountApplied false (no discount field exists, so this is correct)",
);
// ===== 30.6: RECOVERY/TESTING NON-STACKING RULES =====

function getTestingRecommendations(
  vo2Status,
  deepDiveAppropriate,
  rmrStatus,
  recoveryStatus,
) {
  const items = [];

  // VO2/Deep Dive: Deep Dive REPLACES VO2 when appropriate, never both
  if (deepDiveAppropriate) {
    items.push("deep_dive");
  } else if (vo2Status === "RECOMMENDED" || vo2Status === "IF_DESIRED") {
    items.push("vo2_metabolic");
  }

  // RMR - independent relevance required, never auto-bundled with VO2/Deep Dive
  if (rmrStatus === "RECOMMENDED") {
    items.push("rmr_test");
  }

  // Sports massage - only if specifically appropriate, high recovery score alone is NOT enough
  if (recoveryStatus === "SPECIFICALLY_APPROPRIATE") {
    items.push("sports_massage");
  }

  return items;
}

// Test 1: Deep Dive appropriate + RMR recommended - should NOT include plain VO2
const test1 = getTestingRecommendations(
  "RECOMMENDED",
  true,
  "RECOMMENDED",
  "REGULAR_SUPPORT_POTENTIALLY_RECOMMENDED",
);
console.log("Deep Dive + RMR test:", test1);
console.log(
  "EXPECTED: ['deep_dive', 'rmr_test'] - NOT vo2_metabolic (Deep Dive replaces it)",
);

// Test 2: High recovery score alone (not "specifically appropriate") - should NOT auto-add massage
const test2 = getTestingRecommendations(
  "LOW",
  false,
  "LOW",
  "REGULAR_SUPPORT_POTENTIALLY_RECOMMENDED",
);
console.log("High recovery score only:", test2);
console.log(
  "EXPECTED: [] - massage NOT auto-added just from high recovery score",
);
// ===== 30.8: 3-MONTH PACKAGE TOTAL + PAYMENT SPLIT =====

function calculate3MonthPackage(recurringMonthlyTotal, oneOffStartupTotal) {
  const initial3MonthTotal = recurringMonthlyTotal * 3 + oneOffStartupTotal;

  // Split into 3 equal payments, remainder goes to payment 3
  const basePayment = Math.floor((initial3MonthTotal / 3) * 100) / 100;
  const payment1 = basePayment;
  const payment2 = basePayment;
  const payment3 =
    Math.round((initial3MonthTotal - payment1 - payment2) * 100) / 100;

  const ongoingFromMonth4 = recurringMonthlyTotal; // one-off items never inflate this

  return {
    initial3MonthTotal,
    payment1,
    payment2,
    payment3,
    checkSum: Math.round((payment1 + payment2 + payment3) * 100) / 100,
    ongoingFromMonth4,
  };
}

// Test: £116/month recurring (Gold) + £99 one-off (Initial Assessment) = £447 total
const testSplit = calculate3MonthPackage(116, 99);
console.log("3-Month Package Split:", testSplit);
console.log(
  "EXPECTED: total 447, payments sum to exactly 447, ongoing = 116 (not inflated by the £99)",
);
// ===== 30.9: PRICE-AT-QUOTE HISTORY =====

function createQuoteSnapshot(productIds, quoteId) {
  const snapshot = {
    quoteId: quoteId,
    createdAt: new Date().toISOString(),
    items: [],
  };

  for (const id of productIds) {
    const product = v3Catalogue[id];
    if (!product) continue;
    snapshot.items.push({
      productId: id,
      name: product.name,
      priceAtQuote: product.price, // FROZEN at quote time
      billing: product.billing,
    });
  }

  return snapshot;
}

// Test: create a quote, then simulate the catalogue price changing afterward
const quote1 = createQuoteSnapshot(
  ["silver_membership", "initial_assessment"],
  "QUOTE-001",
);
console.log("Original Quote:", JSON.stringify(quote1, null, 2));

// Now simulate an operator editing the live catalogue price (on a local
// copy — mutating v3Catalogue itself here would permanently corrupt the
// shared catalogue for every other consumer of this module, since this
// demo runs at module load time on every require()).
const simulatedCatalogueEdit = { ...v3Catalogue.silver_membership, price: 95 };
console.log("\nLive catalogue price is now:", simulatedCatalogueEdit.price);
console.log("But the OLD quote still shows:", quote1.items[0].priceAtQuote);
console.log(
  "EXPECTED: old quote price stays 84, unaffected by the catalogue change to 95",
);
// ===== 30.10: THREE-TIER PACKAGE ASSEMBLY (Essential / Recommended / VIP) =====
// Brief sections 14-16, stage 1 (engine only - the staff page rebuild is a
// separate later stage). Produces Essential / Recommended / VIP alongside
// the existing single recommendedPackage above, which is left untouched.
//
// Reuses everything already built for this rather than reinventing it:
// getCoachingPricing/getNutritionPricing (30.3/30.4) for PT and nutrition,
// assignPlanTiers (see "PLAN TIER ASSIGNMENT" above) for clinical/recovery/
// testing placement - it already buckets services into
// essentialPrerequisite/essentialCore/recommended/vip using exactly the
// vocabulary determineClinicalService/determineRecoveryService/the VO2-RMR-
// BodyComp functions produce, which is a strong signal it's the intended
// classifier for this rather than something to duplicate. Its buckets are
// mutually exclusive (single home per item); converted to cumulative tiers
// below since VIP must contain everything Recommended has, plus more.
// Nutrition is excluded from the assignPlanTiers call (passed a null level
// so its cruder nutrition branch never fires) because getNutritionPricing
// already supersedes it with an escalating, catalogue-aware map.

// v3Catalogue-aware version of calculatePackageTotal (30.2's version only
// knows the older priceCatalogue). getPhysioPricing is generic despite its
// name - it falls back to catalogueItem.price whenever discountedPrice
// isn't set - so it's reused here for every product, not just physio ones.
function calculateV3PackageTotal(productIds, hasQualifyingMembershipOrCoaching) {
  let recurringMonthlyTotal = 0;
  let oneOffTotal = 0;
  const lineItems = [];

  for (const id of productIds) {
    const catalogueItem = v3Catalogue[id];
    if (!catalogueItem) continue;

    const priced = getPhysioPricing(id, hasQualifyingMembershipOrCoaching);
    lineItems.push({
      productId: id,
      name: priced.name,
      price: priced.price,
      billing: catalogueItem.billing,
      discountApplied: priced.discountApplied,
    });

    if (catalogueItem.billing === "RECURRING_MONTHLY") {
      recurringMonthlyTotal += priced.price;
    } else if (catalogueItem.billing === "ONE_OFF") {
      oneOffTotal += priced.price;
    }
  }

  return { lineItems, recurringMonthlyTotal, oneOffTotal };
}

// Same set getPhysioPricing's discount is meant to qualify against,
// mirrored from api/staff/[id].js's MEMBERSHIP_OR_COACHING_KEYS (that
// file's own comment says it "matches the rule already defined in
// index.js" - kept as an independent copy here rather than importing
// across files, since the staff page rebuild is out of scope for this
// stage and isn't touched by this change).
const MEMBERSHIP_OR_ONGOING_COACHING_IDS = new Set([
  "bronze_membership",
  "silver_membership",
  "gold_membership",
  "platinum_membership",
  "unlimited_membership",
  "coaching_1x_week",
  "coaching_2x_week",
]);

// assignPlanTiers returns human-readable service descriptions, not
// catalogue product ids - this bridges the two for the clinical/testing
// services it covers. Recovery is deliberately NOT in this map - see
// deriveRecoveryVipIds below for why it's handled separately.
const ANCILLARY_SERVICE_TO_PRODUCT_ID = {
  "Clinical/Physio Assessment": "physio_initial",
  "VO2/Metabolic Testing": "vo2_metabolic",
  "RMR Testing": "rmr_test",
  "Body Composition Baseline": "deep_dive",
};

// OPEN QUESTION FOR THE CLIENT - CONFLICT WITH BRIEF SECTION 13:
// assignPlanTiers' own recovery branch (see "PLAN TIER ASSIGNMENT" above)
// auto-maps sports_massage from three of the four possible recovery
// statuses (REGULAR_SUPPORT_POTENTIALLY_RECOMMENDED and INDIVIDUAL_REVIEW
// into "recommended", OCCASIONAL_ADVICE into "vip") - all three derived
// purely from the Q19/Q20 score. Section 13 of the brief explicitly says a
// high recovery score must never be auto-mapped to massage on its own, and
// determineRecoveryService's own comment agrees ("Type is NOT auto-mapped
// to massage from score alone - left for staff/further logic"). There is
// no signal in the pipeline for *why* a recovery need exists (soreness a
// massage would address vs. sleep/stress/lifestyle a massage wouldn't) -
// only the score-derived status - so assignPlanTiers' recovery branch is
// NOT reused here (recovery is passed to it as { status: null } so that
// branch never fires).
// Interim behaviour pending client confirmation: sports_massage - the only
// recovery-category catalogue item - is surfaced only at VIP, only for the
// single most severe band (INDIVIDUAL_REVIEW), and always as
// VIP_IF_DESIRED rather than a firm Essential/Recommended inclusion. This
// still technically ties a score to massage, just the highest one and only
// as an optional, client-facing "if desired" suggestion rather than a
// confident recommendation - it is NOT a resolution of the section 13
// conflict, only the narrowest version of "keep sports_massage as the
// mapping" that avoids stating a firm recommendation the brief prohibits.
function deriveRecoveryVipIds(recovery) {
  return recovery.status === "INDIVIDUAL_REVIEW" ? ["sports_massage"] : [];
}

function deriveAncillaryProductIds(services, testingServices) {
  const buckets = assignPlanTiers({
    clinical: services.clinical,
    nutrition: { level: null, status: undefined },
    recovery: { status: null }, // see deriveRecoveryVipIds above
    vo2: testingServices.vo2,
    rmr: testingServices.rmr,
    bodyComp: testingServices.bodyComp,
  });

  const toProductIds = (bucket) =>
    bucket.map((entry) => ANCILLARY_SERVICE_TO_PRODUCT_ID[entry.service]).filter(Boolean);

  const prerequisiteIds = toProductIds(buckets.essentialPrerequisite);
  const recommendedOnlyIds = toProductIds(buckets.recommended);
  const vipOnlyIds = [...toProductIds(buckets.vip), ...deriveRecoveryVipIds(services.recovery)];

  // Deep Dive replaces plain VO2/Metabolic testing when both would
  // otherwise land in the same tier - getTestingRecommendations' own
  // "non-stacking" rule (30.6) - applied here as a de-dup pass on top of
  // assignPlanTiers' placement rather than re-deriving it from scratch.
  const dedupeVo2DeepDive = (ids) =>
    ids.includes("deep_dive") ? ids.filter((id) => id !== "vo2_metabolic") : ids;

  return {
    essentialIds: dedupeVo2DeepDive([...prerequisiteIds]),
    recommendedIds: dedupeVo2DeepDive([...prerequisiteIds, ...recommendedOnlyIds]),
    vipIds: dedupeVo2DeepDive([...prerequisiteIds, ...recommendedOnlyIds, ...vipOnlyIds]),
  };
}

// VO2/RMR/Body Composition were fully built (see "VO2/METABOLIC, RMR, BODY
// COMPOSITION SERVICES" above) but never fed real inputs anywhere - wired
// up here from data already flowing through the pipeline.
function deriveTestingServices(complete, flags) {
  const goals = flags.goals || [];
  const hasEnduranceCardioGoal = goals.includes(
    "Improve my cardiovascular fitness or endurance",
  );
  const significantWeightBodyCompGoal = goals.includes(
    "Lose weight or reduce body fat",
  );
  const highPerformanceFocus =
    !isUnresolved(complete.axes.performanceFocus.score) &&
    complete.axes.performanceFocus.score >= 8;
  const highDataInterest =
    !isUnresolved(complete.rawScores.q18) && complete.rawScores.q18 >= 6;
  // Q18 answered at the bottom of its scale ("Not important"=0/"Nice to
  // know"=2) - the client has actively told us objective data isn't
  // important to them, not merely left it unresolved. Gates RMR/Body
  // Composition below - see the comment on determineRMRService.
  const explicitLowDataInterest =
    !isUnresolved(complete.rawScores.q18) && complete.rawScores.q18 <= 2;
  const hasHyroxOrEnduranceGoal =
    complete.classMatch.bestStartingMatch === "hyrox" || hasEnduranceCardioGoal;

  const vo2 = determineVO2MetabolicService({
    hasEnduranceCardioGoal,
    hasEvent: flags.eventOrCompetition || false,
    highPerformanceFocus,
    highDataInterest,
    hasHyroxOrEnduranceGoal,
  });
  const rmr = determineRMRService({
    significantWeightBodyCompGoal,
    nutritionRelevance: complete.rawScores.q13,
    objectiveDataInterest: complete.rawScores.q18,
    explicitLowDataInterest,
  });
  const bodyComp = determineBodyCompositionService({
    bodyCompositionImportant: significantWeightBodyCompGoal,
    valuesMeasurableData: highDataInterest,
    explicitLowDataInterest,
  });

  return { vo2, rmr, bodyComp };
}

// The one VIP addition classified as a genuine need-driven enhancement
// rather than a preference - getCoachingPricing's own comment already
// frames the HIGH/VERY HIGH band's VIP upgrade this way ("1x/week ->
// 2x/week"). Every other VIP-only addition is a preference, so it's
// VIP_IF_DESIRED and must carry the client-facing "If Desired" label.
const VIP_ENHANCEMENT_NEEDED_PRODUCT_IDS = new Set(["coaching_2x_week"]);

function buildTieredPackages(complete, answers, flags) {
  const { axes, services, ptNeed } = complete;
  const isWeightBodyFatPrimaryGoal = (flags.goals || []).includes(
    "Lose weight or reduce body fat",
  );
  const testingServices = deriveTestingServices(complete, flags);
  const ancillaryIds = deriveAncillaryProductIds(services, testingServices);

  const membershipTier = lookupAnswer(Q5_FREQUENCY_TO_MEMBERSHIP_TIER, answers.q5);
  const membershipUnresolved = !membershipTier;
  const membershipItem = membershipTier ? [membershipTier] : [];

  const productIdsForTier = (tier, ancillaryIdsForTier) => [
    ...membershipItem,
    ...getCoachingPricing(ptNeed.band, tier),
    ...(services.nutrition.level
      ? getNutritionPricing(
          services.nutrition.level,
          tier,
          isWeightBodyFatPrimaryGoal,
          axes.nutritionSupport.score,
        )
      : []),
    ...ancillaryIdsForTier,
  ];

  const priceTier = (productIds) => {
    const hasQualifyingMembershipOrCoaching = productIds.some((id) =>
      MEMBERSHIP_OR_ONGOING_COACHING_IDS.has(id),
    );
    return {
      ...calculateV3PackageTotal(productIds, hasQualifyingMembershipOrCoaching),
      membershipUnresolved,
    };
  };

  const essentialProductIds = productIdsForTier("essential", ancillaryIds.essentialIds);
  const recommendedProductIds = productIdsForTier("recommended", ancillaryIds.recommendedIds);
  const vipProductIds = productIdsForTier("vip", ancillaryIds.vipIds);

  const essential = priceTier(essentialProductIds);
  const recommended = priceTier(recommendedProductIds);
  const vip = priceTier(vipProductIds);

  // Label VIP-only additions (relative to Recommended) with their
  // classification, for the client-facing "If Desired" requirement.
  // Irrelevant services are never added just to inflate VIP - every VIP
  // line item traces back to either a real ancillary-service signal
  // (via deriveAncillaryProductIds) or getCoachingPricing's own
  // need-driven/preference-led product choices, never invented here.
  const recommendedProductIdSet = new Set(recommendedProductIds);
  vip.lineItems = vip.lineItems.map((item) => {
    if (recommendedProductIdSet.has(item.productId)) return item;
    const vipType = VIP_ENHANCEMENT_NEEDED_PRODUCT_IDS.has(item.productId)
      ? "VIP_ENHANCEMENT_NEEDED"
      : "VIP_IF_DESIRED";
    return {
      ...item,
      vipType,
      vipLabel: vipType === "VIP_IF_DESIRED" ? "If Desired" : undefined,
    };
  });

  // VIP must never total less than Recommended, and Recommended must never
  // total less than Essential - each tier is built as "the one below, plus
  // enhancements," so this should hold by construction, but a VIP package
  // priced below Recommended in front of a client would be embarrassing,
  // so this is checked rather than trusted.
  const grandTotal = (tier) => tier.recurringMonthlyTotal + tier.oneOffTotal;
  const essentialGrandTotal = grandTotal(essential);
  const recommendedGrandTotal = grandTotal(recommended);
  const vipGrandTotal = grandTotal(vip);

  if (recommendedGrandTotal < essentialGrandTotal) {
    throw new Error(
      `Recommended package total (${recommendedGrandTotal}) is less than Essential's (${essentialGrandTotal}) - tiers must never shrink going up.`,
    );
  }
  if (vipGrandTotal < recommendedGrandTotal) {
    throw new Error(
      `VIP package total (${vipGrandTotal}) is less than Recommended's (${recommendedGrandTotal}) - tiers must never shrink going up.`,
    );
  }

  return { essential, recommended, vip };
}

// Final end-to-end test: Worked Example A, all the way through to price -
// moved here (was originally right after runFullAssessmentWithPricing's
// own definition) because it now needs v3Catalogue and the v3-based
// pricing functions above, which aren't initialised yet up there.
const finalResultA = runFullAssessmentWithPricing(
  {
    q3: "3–4 times per week",
    q4: "3 sessions per week",
    q5: "2 sessions per week",
    q6: "Fairly confident",
    q7: "Quite confident",
    q8: "Quite easy – usually consistent",
    q9: "Occasional check-ins",
    q10: "Not at all",
    q11: "No",
    q12: "Not applicable",
    q13: "Moderately",
    q14: "Quite confident",
    q15: "Occasional guidance",
    q16: "Slightly",
    q17: "No",
    q18: "Nice to know",
    q19: "Quite well – occasional issues",
    q20: "Occasional advice/support",
  },
  {
    goals: [
      "Improve my general health and fitness",
      "Stay fit, strong and independent as I get older",
    ],
    longevityFocus: true,
    q21_Cardiovascular: true,
    q21_Independence: true,
    balancedTrainingNeed: true,
    preferredStyle: "MIXED",
  },
);

console.log("\n=== FINAL END-TO-END TEST: ANSWERS -> PRICED PACKAGE ===");
console.log("Class:", finalResultA.classMatch.bestStartingMatch);
console.log("PT Band:", finalResultA.ptNeed.band);
console.log(
  "Recommended Package:",
  JSON.stringify(finalResultA.recommendedPackage, null, 2),
);
console.log(
  "Tiered Packages:",
  JSON.stringify(finalResultA.tieredPackages, null, 2),
);

module.exports = {
  runFullAssessmentComplete,
  runFullAssessmentWithPricing,
  v3Catalogue,
  priceCatalogue,
  getPhysioPricing,
  calculateV3PackageTotal,
};
