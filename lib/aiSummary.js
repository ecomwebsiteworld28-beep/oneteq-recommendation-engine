// AI-generated plain-English client summary.
//
// The engine's recommendation never changes here - this only EXPLAINS what
// has already been decided. Everything the model is told is built
// deterministically from the stored result (buildSummaryFacts), so it never
// sees raw scores, prices, names or contact details, and the summary is an
// addition to an assessment, never a dependency of it: nothing in this file
// throws to its callers, and the SDK is only loaded when a summary is
// actually generated, so a problem with it can't affect anything else.

const {
  GHL_CUSTOM_FIELD_KEYS,
  GHL_CUSTOM_FIELD_IDS,
  getCustomFieldValue,
  updateGhlContactCustomFields,
} = require('./ghl.js');

const DEFAULT_MODEL = 'claude-sonnet-5';
const SUMMARY_TIMEOUT_MS = 20000;

function isSummaryEnabled() {
  return process.env.AI_SUMMARY_ENABLED === 'true';
}

// ---- What the model is told (all derived from the stored result) ----

// One client-friendly sentence per class, taken from brief section 9
// ("developer must use these"). Foundation's and HYROX's emphasised rules
// are hard prohibitions in SYSTEM_PROMPT below.
const CLASS_INFO = {
  foundation: {
    name: 'Foundation',
    meaning:
      'Foundation is an accessible, coached strength and general-fitness class that follows a similar structure to Lift, with a barbell lift that may be included at the start, and it suits people building confidence, returning to exercise or newer to training.',
  },
  lift: {
    name: 'Lift',
    meaning:
      'Lift always begins with a barbell lift, followed by a pair of weighted exercises done as a superset, and finishes with a strength circuit.',
  },
  hybrid: {
    name: 'Hybrid',
    meaning:
      'Hybrid starts with a structured barbell lift and a weighted superset, then finishes with roughly 15 to 20 minutes of cardio and strength conditioning, sitting between Lift and HYROX.',
  },
  hyrox: {
    name: 'HYROX',
    meaning:
      'HYROX training is built around the movements and physical demands of the eight HYROX race stations plus running and cardio, although a class does not need all eight stations every session and people of moderate fitness work at their own pace.',
  },
};

// Plain-language name for each axis (what the questions behind it measure).
const AXIS_AREAS = [
  ['coaching', 'coaching support with programming and technique'],
  ['accountability', 'structure and accountability to stay consistent'],
  ['clinicalSupport', 'physiotherapy and clinical support'],
  ['nutritionSupport', 'nutrition support'],
  ['performanceFocus', 'performance and event focus'],
  ['recoverySupport', 'recovery support'],
  ['training', 'regular structured training'],
];

// Brief section 6: "Higher means greater relevance/support need in that
// area, not 'better' or 'worse'." - so the bands describe relevance, never
// quality.
function relevanceBand(score) {
  if (score < 4) return 'lower';
  if (score < 7) return 'moderate';
  if (score < 9) return 'high';
  return 'very high';
}

const PT_BAND_TO_RELEVANCE = { LOW: 'lower', MODERATE: 'moderate', HIGH: 'high', 'VERY HIGH': 'very high' };

const PER_WEEK_PHRASE = {
  1: 'once a week',
  2: 'twice a week',
  3: 'three times a week',
  4: 'four times a week',
};

function perWeekPhrase(answer) {
  const match = String(answer || '').match(/^\s*(\d)(\+)?\s+sessions?\s+per\s+week/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (match[2]) return `${n} or more times a week`;
  return PER_WEEK_PHRASE[n] || null;
}

const SESSIONS_PER_MONTH_PHRASE = {
  4: 'about once a week',
  8: 'about twice a week',
  12: 'about three times a week',
  16: 'about four times a week',
};

// Never guesses (same rule as the engine's Q5 handling): the client's own
// Q5, then their Q4, then the engine's own provisional membership
// suggestion, otherwise nothing.
function deriveTrainingFrequency(rawAnswers, recommendedPackage) {
  const q5 = perWeekPhrase(rawAnswers && rawAnswers.q5);
  if (q5) return { provisional: false, text: `${q5} at ONETEQ, as the client asked for` };

  const q4 = perWeekPhrase(rawAnswers && rawAnswers.q4);
  if (q4) return { provisional: false, text: `${q4} in total, including any training outside ONETEQ, as the client said they would like` };

  if (recommendedPackage && recommendedPackage.membershipSuggested) {
    const suggested = (recommendedPackage.lineItems || []).find((item) => item.suggested);
    const match = suggested && String(suggested.name).match(/(\d+)\s*sessions\/month/i);
    const phrase = match && SESSIONS_PER_MONTH_PHRASE[Number(match[1])];
    if (phrase) return { provisional: true, text: `${phrase} to begin with` };
  }

  return null;
}

// Plain-language support areas from the Recommended tier's own line items.
// Membership, the initial assessment and the director consultation are
// deliberately not areas - only the kinds of support worth discussing.
function deriveSupportAreas(tieredPackages) {
  const items = (tieredPackages && tieredPackages.recommended && tieredPackages.recommended.lineItems) || [];
  const areas = [];
  const add = (area) => {
    if (!areas.includes(area)) areas.push(area);
  };
  for (const item of items) {
    const id = item.productId || '';
    if (id.startsWith('physio_')) add('physiotherapy');
    else if (id.startsWith('nutrition_')) add('nutrition support');
    else if (id === 'sports_massage') add('sports massage and recovery work');
    else if (['vo2_metabolic', 'endurance_metabolic', 'rmr_test', 'deep_dive'].includes(id)) {
      add('fitness and metabolic testing');
    } else if (id.startsWith('coaching_') || id === 'payg_1to1' || id === 'programme_review') {
      add('one-to-one coaching');
    }
  }
  return areas;
}

// The client's own goal wording, minus non-goals ("No other major goals")
// and with the one survey option that mentions age reworded - the summary
// must never associate a class with age (brief section 9), so the model
// isn't handed the word to echo.
function summariseGoals(goals) {
  return (Array.isArray(goals) ? goals : [])
    .filter((goal) => typeof goal === 'string' && !/^no other/i.test(goal.trim()))
    .map((goal) => goal.replace(/\bas I get older\b/i, 'for the long term'));
}

// Returns null when no class has been decided (nothing to explain).
function buildSummaryFacts(storedResult, goals) {
  const classMatch = storedResult && storedResult.classMatch;
  const startingClass = classMatch && CLASS_INFO[classMatch.bestStartingMatch];
  if (!startingClass) return null;

  const startedAtFoundationByDesign = Boolean(classMatch.overrideApplied) && classMatch.bestStartingMatch === 'foundation';

  let progressingToward;
  if (startedAtFoundationByDesign && storedResult.classScores) {
    const best = ['lift', 'hybrid', 'hyrox']
      .map((key) => [key, storedResult.classScores[key]])
      .filter(([, score]) => typeof score === 'number' && score > 0)
      .sort((a, b) => b[1] - a[1])[0];
    if (best) progressingToward = CLASS_INFO[best[0]];
  }

  const axes = (storedResult && storedResult.axes) || {};
  const areas = [];
  const notEnoughInformation = [];
  for (const [key, label] of AXIS_AREAS) {
    const axis = axes[key];
    if (axis && !axis.unresolved && typeof axis.score === 'number') {
      areas.push({ area: label, relevance: relevanceBand(axis.score), _score: axis.score });
    } else {
      notEnoughInformation.push(label);
    }
  }
  areas.sort((a, b) => b._score - a._score);
  areas.forEach((entry) => delete entry._score);

  const ptNeed = storedResult.ptNeed || {};
  const oneToOneRelevance = !ptNeed.unresolved && PT_BAND_TO_RELEVANCE[ptNeed.band];

  const facts = {
    startingClass,
    startedAtFoundationByDesign,
    ...(progressingToward ? { progressingToward } : {}),
    goals: summariseGoals(goals),
    areas,
    notEnoughInformation,
    ...(oneToOneRelevance ? { overallOneToOneGuidanceRelevance: oneToOneRelevance } : {}),
    trainingFrequency: deriveTrainingFrequency(storedResult.rawAnswers, storedResult.recommendedPackage),
    supportAreas: deriveSupportAreas(storedResult.tieredPackages),
  };
  if (storedResult.derivedFlags && storedResult.derivedFlags.postnatalReturnToExercise === true) {
    facts.returningToExerciseAfterHavingABaby = true;
  }
  return facts;
}

const SYSTEM_PROMPT = `You are writing a short personal summary for a client of ONETEQ, a physiotherapy and personal-training practice. Our team has already assessed the client and decided their recommendation. Your job is only to explain that decision in warm, plain English. You never make, change or question the recommendation.

Voice: write as the ONETEQ team ("we"), speaking directly to the client ("you"), the way an experienced physio and coach would talk to someone in the clinic: calm, practical, encouraging, never salesy. British spelling. No exclamation marks, emojis, headings, bullet points or markdown. Avoid marketing language and filler such as "journey", "unlock", "transform" or "game-changer". Never mention AI, scores, algorithms, the questionnaire, or "the system".

Write 3 to 4 short paragraphs, 170 to 230 words in total, covering in this order:
1. Why this class suits them. Name the class, say in one sentence what it involves (use the meaning provided, in your own words), and connect it to the goals they told us about. If startedAtFoundationByDesign is true, explain that starting here is deliberate: we build a sound base first, then progress them towards the class named in progressingToward.
2. What we picked up. The "areas" list is ordered from most to least relevant. Describe the top two or three in everyday terms, as areas where support would be especially useful (for example, "regular hands-on guidance would help you get the most from your sessions"). Skip anything under notEnoughInformation, or say we will go through it together.
3. How often to train. Use trainingFrequency as given. If it is marked provisional, say it is a starting point we will settle together. If it is null, say we will agree it together.
4. Support that looks relevant. Mention only the supportAreas provided, as things worth talking through, not things they must take up. If the list is empty, say we will talk through what support would help.
Finish with one sentence inviting them to talk it through with the team. No other call to action, and no contact details.

Hard rules:
- The relevance labels (lower, moderate, high, very high) show how relevant an area is to this client, meaning how much support would help there. They are NOT a measure of how good or bad the client is. Never frame a high label as a weakness or failing, and never frame a lower one as a pass or a strength. Use them only to decide emphasis, never quote a label, and never call an area "high" or "low". Talk about what support would help, not how well they are doing.
- Never say or imply that Foundation is for older people, and do not mention age at all.
- Never say or imply that HYROX is only for very fit, elite or advanced people.
- Use only the facts provided. If something is missing, do not guess; say the team will confirm it.
- Only mention returning to exercise after having a baby if returningToExerciseAfterHavingABaby is true.
- Never state or imply a price, cost, fee, discount, package, membership or tier, and never use a currency symbol.
- Do not diagnose, give medical advice, comment on any injury or condition beyond what the facts state, or promise outcomes.
- Do not hedge or contradict the recommendation.`;

// ---- Output checks: any hit means the summary is discarded, not stored ----

const OUTPUT_RULES = [
  ['currency symbol', /[£$€]/],
  ['price wording', /\b(pounds?|price[sd]?|pricing|costs?|fees?|discounts?|packages?|memberships?|tiers?|per month|quid)\b/i],
  ['AI / scores wording', /\bAI\b|artificial intelligence|algorithm|\bscores?\b|\bscored\b/i],
  ['numeric rating', /\d+(\.\d+)?\s*(\/\s*10|%)/],
  ['age wording', /\b(older|elderly|seniors?|ages?|aged|over[- ]\d{2}s?)\b/i],
  ['elite/only-for wording', /\b(elite|alpha)\b|\bonly for\b/i],
  [
    'good/bad framing',
    /\b(weak|weakness(es)?|poor|poorly|failing|failed|bad|worse|worst|deficien\w*|unfit|out of shape|low score|high score|good score)\b/i,
  ],
  ['markdown / bullets', /[*#_`]|^\s*[-•]\s/m],
  ['exclamation mark', /!/],
];

function validateSummary(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty' };
  const words = text.trim().split(/\s+/).length;
  if (words < 110 || words > 330) return { ok: false, reason: `length out of range (${words} words)` };
  for (const [name, pattern] of OUTPUT_RULES) {
    if (pattern.test(text)) return { ok: false, reason: `failed check: ${name}` };
  }
  return { ok: true, words };
}

// ---- The model call ----

// Never throws. Returns {ok, text?, reason?, model, latencyMs, usage?}.
async function produceSummary(facts) {
  const model = process.env.AI_SUMMARY_MODEL || DEFAULT_MODEL;
  const started = Date.now();
  const finish = (fields) => ({ model, latencyMs: Date.now() - started, ...fields });

  if (!process.env.ANTHROPIC_API_KEY) {
    return finish({ ok: false, reason: 'ANTHROPIC_API_KEY is not set' });
  }

  let response;
  try {
    const sdk = require('@anthropic-ai/sdk');
    const Anthropic = sdk.Anthropic || sdk.default || sdk;
    const client = new Anthropic({ timeout: SUMMARY_TIMEOUT_MS, maxRetries: 0 });
    response = await client.messages.create({
      model,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(facts, null, 2) }],
    });
  } catch (error) {
    // Error type / HTTP status only - never the message body, which could
    // echo request content.
    return finish({ ok: false, reason: `API call failed (${error && (error.status || error.name)})` });
  }

  if (response.stop_reason !== 'end_turn') {
    return finish({ ok: false, reason: `unexpected stop reason: ${response.stop_reason}`, usage: response.usage });
  }

  const text = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  const validation = validateSummary(text);
  if (!validation.ok) {
    return finish({ ok: false, reason: validation.reason, rejectedText: text, usage: response.usage });
  }
  return finish({ ok: true, text, usage: response.usage });
}

// ---- Storing it ----

async function writeSummaryField(contactId, value) {
  await updateGhlContactCustomFields(contactId, [
    { key: GHL_CUSTOM_FIELD_KEYS.aiClientSummary, fieldValue: value },
  ]);
}

// Generates and stores a summary. Never throws. When clearOnFailure is
// true (a Recalculate, where the old text may now contradict the new
// result) a failed generation blanks the field instead of leaving stale
// text in place.
async function generateAndStoreSummary({ contactId, storedResult, goals, clearOnFailure }) {
  if (!isSummaryEnabled()) return { status: 'skipped', reason: 'AI_SUMMARY_ENABLED is not true' };

  const clearIfRequested = async () => {
    if (!clearOnFailure) return;
    try {
      await writeSummaryField(contactId, '');
    } catch (error) {
      console.error('Could not clear stale AI summary:', error.message);
    }
  };

  const facts = buildSummaryFacts(storedResult, goals);
  if (!facts) {
    await clearIfRequested();
    return { status: 'skipped', reason: 'no class decided' };
  }

  const produced = await produceSummary(facts);
  if (!produced.ok) {
    console.error(`AI summary not generated for ${contactId}: ${produced.reason}`);
    await clearIfRequested();
    return { status: 'failed', reason: produced.reason, latencyMs: produced.latencyMs };
  }

  try {
    await writeSummaryField(contactId, produced.text);
  } catch (error) {
    console.error(`AI summary generated but could not be saved for ${contactId}:`, error.message);
    return { status: 'failed', reason: 'could not save to GHL', latencyMs: produced.latencyMs };
  }
  return { status: 'generated', latencyMs: produced.latencyMs, usage: produced.usage };
}

function parseStoredResult(contact) {
  const raw = getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.assessmentRawResponse);
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

module.exports = {
  isSummaryEnabled,
  buildSummaryFacts,
  validateSummary,
  produceSummary,
  generateAndStoreSummary,
  parseStoredResult,
  SYSTEM_PROMPT,
};
