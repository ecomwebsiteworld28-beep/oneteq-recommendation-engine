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

// Plain-language name for each SUPPORT axis (what the questions behind it
// measure). The training axis is deliberately absent: per the brief it is
// "training contribution derived from desired training frequency" - how
// much the client wants to train, not how much support they need - so it
// doesn't belong alongside genuine support needs, and frequency already
// has its own paragraph (deriveTrainingFrequency).
const AXIS_AREAS = [
  ['coaching', 'coaching support with programming and technique'],
  ['accountability', 'structure and accountability to stay consistent'],
  ['clinicalSupport', 'physiotherapy and clinical support'],
  ['nutritionSupport', 'nutrition support'],
  ['performanceFocus', 'performance and event focus'],
  ['recoverySupport', 'recovery support'],
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

// The frequency sentence is written here, in code, and the model is told to
// include it verbatim (and the output check enforces that). What we know is
// fully determined - the client stated a figure, asked us to advise, or we
// are suggesting one - so there is nothing for the model to add, and no way
// for it to attribute a suggestion to the client or invent an arrangement.
// Never guesses (same rule as the engine's Q5 handling): the client's own
// Q5, then their Q4, then the engine's own provisional membership
// suggestion, otherwise nothing. Plain apostrophes/words only, so the text
// survives being copied verbatim.
function isAdviceRequest(answer) {
  return /recommend this|advice on this/i.test(String(answer || ''));
}

function deriveFrequencySentence(rawAnswers, recommendedPackage) {
  const answers = rawAnswers || {};
  const q5 = perWeekPhrase(answers.q5);
  if (q5) return `You told us you would like to train ${q5} at ONETEQ.`;

  const q4 = perWeekPhrase(answers.q4);
  if (q4) return `You told us you would like to train ${q4} in total, including anything you do outside ONETEQ.`;

  const askedForAdvice = isAdviceRequest(answers.q5) || isAdviceRequest(answers.q4);

  if (recommendedPackage && recommendedPackage.membershipSuggested) {
    const suggested = (recommendedPackage.lineItems || []).find((item) => item.suggested);
    const match = suggested && String(suggested.name).match(/(\d+)\s*sessions\/month/i);
    const phrase = match && SESSIONS_PER_MONTH_PHRASE[Number(match[1])];
    if (phrase) {
      return `${askedForAdvice ? 'You asked us to recommend how often to train, and as' : 'As'} a starting point we would suggest ${phrase}. The team will go through that with you.`;
    }
  }

  return askedForAdvice
    ? 'You asked us to advise on how often to train, so we will go through that together.'
    : 'How often you train each week is something to talk through with the team.';
}

const NO_AREAS_SENTENCE =
  'We need a bit more from you before we can say where support would help most, so we would like to go through that with you.';

// The support paragraph and the closing sentence are the two places every
// summary drifted into the same formula, and the model can't see other
// clients' summaries - so the wording approach is picked deterministically
// from the facts, which varies it from client to client.
const SUPPORT_PARAGRAPH_STYLES = [
  'Present the support areas plainly, as things the team can go through with them if they would find it useful.',
  'Say the team can explain these in more detail so the client can decide what they want, if anything.',
  'Say these are worth a conversation and that the decision is entirely the client’s.',
  'Mention them briefly in a single sentence, in the order given, with no framing phrase at all.',
];
const CLOSING_STYLES = [
  'Close by saying the team would be glad to talk it through whenever suits them.',
  'Close by inviting them to bring any questions to the team.',
  'Close by saying the next step is simply a conversation with the team.',
  'Close by inviting them to come and talk it over with the team.',
];

function stableIndex(text, modulus, useHighBits) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return (useHighBits ? hash >>> 11 : hash) % modulus;
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
    frequencySentence: deriveFrequencySentence(storedResult.rawAnswers, storedResult.recommendedPackage),
    supportAreas: deriveSupportAreas(storedResult.tieredPackages),
  };
  if (areas.length === 0) facts.noAreasSentence = NO_AREAS_SENTENCE;
  if (storedResult.derivedFlags && storedResult.derivedFlags.postnatalReturnToExercise === true) {
    facts.returningToExerciseAfterHavingABaby = true;
  }
  const seed = JSON.stringify(facts);
  facts.styleNotes = {
    supportParagraph: SUPPORT_PARAGRAPH_STYLES[stableIndex(seed, SUPPORT_PARAGRAPH_STYLES.length, false)],
    closing: CLOSING_STYLES[stableIndex(seed, CLOSING_STYLES.length, true)],
  };
  return facts;
}

const SYSTEM_PROMPT = `You are writing a short personal summary for a client of ONETEQ, a physiotherapy and personal-training practice. Our team has already assessed the client and decided their recommendation. Your job is only to explain that decision in warm, plain English. You never make, change or question the recommendation.

Voice: write as the ONETEQ team ("we"), speaking directly to the client ("you"), the way an experienced physio and coach would talk to someone in the clinic: calm, practical, plain-spoken, never salesy. British spelling. No exclamation marks, emojis, headings, bullet points or markdown. Never use marketing language or filler: not "journey", "unlock", "transform", "game-changer", "a great match", "make a real difference", "real value", "add-ons", "musts", or any form of "stand out" ("stands out", "stood out", "standing out"). Never say something is "worth having", "worth having in place" or "worth having alongside": support is only ever "worth a conversation", something the team can go through with them. Never mention AI, scores, algorithms, the questionnaire, or "the system".

Write 3 to 4 short paragraphs, 150 to 210 words in total (be concise), covering in this order:
1. Why this class suits them. Name the class, say in one sentence what it involves (use the meaning provided, in your own words), and connect it to the goals they told us about. If startedAtFoundationByDesign is true, explain that starting here is deliberate: we build a sound base first, then progress them towards the class named in progressingToward.
2. What we picked up. If noAreasSentence is present, this paragraph is that sentence, word for word, and nothing else. Otherwise the "areas" list is ordered from most to least relevant: describe the top two or three in everyday terms, as areas where support would help (for example, "hands-on guidance with your programme would help you get the most from your sessions"). Ignore anything under notEnoughInformation, or say the team will go through it with them.
3. How often to train. This paragraph is frequencySentence, copied word for word, and nothing else. Do not paraphrase it, add to it, or say anything else about how often they will train.
4. Support that looks relevant. Only if supportAreas is not empty: mention only the supportAreas provided, following styleNotes.supportParagraph for how to frame them. If supportAreas is empty, leave this paragraph out entirely.
Finish with one sentence, following styleNotes.closing, that points them to a conversation with the team. No other call to action, and no contact details.

Hard rules:
- ABSOLUTE: never describe any arrangement, service, agreement, plan, appointment or commitment that the facts do not contain. Never say or imply that anything has been agreed, arranged, booked, set up or promised, and never mention check-ins, monitoring, reviews or follow-ups. Do not say what we will do with anything the client told us (for example "that is what we will work around", "we have noted this", "we will keep an eye on"). The only thing you may say the team will do is talk things through with them.
- Describe each class using only what its meaning says. Do not add anything to it (for example, do not say a class includes cardio unless its meaning says so).
- Do not compare classes by intensity, difficulty or level, and do not call any class easier, harder, gentler, tougher or more or less demanding. Describe what each class involves and nothing more.
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
  [
    'asserted arrangement',
    /\b(?:we(?:['’]ve| have) (?:already )?(?:agreed|arranged|booked|scheduled|set up|planned|noted)|agreed with you|as agreed|we(?:['’]ll| will) (?:check in|monitor|review your|follow up|be in touch|contact you|call you|book|work (?:with|around))|keep(?:ing)? an eye|so that(?:['’]s| is) what|check-?ins?)\b/i,
  ],
  ['class ranking wording', /\b(intens(?:e|ity|ive)|harder|easier|tougher|gentler|gentle|more demanding|less demanding|difficult\w*)\b/i],
  ['banned phrase', /\b(great match|real difference|real value|add-?ons?|musts?|need to commit|stands? out|game-?changer|journey|unlock\w*|transform\w*)\b/i],
];

const FREQUENCY_CLAIM = /\b(?:once|twice|(?:two|three|four|five|\d+) or more times|(?:two|three|four|five) times) a week\b/i;

// facts is optional; when given, the code-written sentences must be
// present verbatim and frequency must not be mentioned anywhere else.
function validateSummary(text, facts) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty' };
  const words = text.trim().split(/\s+/).length;
  if (words < 90 || words > 260) return { ok: false, reason: `length out of range (${words} words)` };
  for (const [name, pattern] of OUTPUT_RULES) {
    if (pattern.test(text)) return { ok: false, reason: `failed check: ${name}` };
  }
  if (facts) {
    if (facts.frequencySentence && !text.includes(facts.frequencySentence)) {
      return { ok: false, reason: 'frequency sentence not included verbatim' };
    }
    if (facts.noAreasSentence && !text.includes(facts.noAreasSentence)) {
      return { ok: false, reason: 'no-areas sentence not included verbatim' };
    }
    const rest = facts.frequencySentence ? text.replace(facts.frequencySentence, '') : text;
    if (FREQUENCY_CLAIM.test(rest)) return { ok: false, reason: 'frequency mentioned outside the provided sentence' };
  }
  return { ok: true, words };
}

// ---- The model call ----

// Total time budget for one summary, inside the function's maxDuration of
// 30 s (vercel.json), so a retry can never outrun it.
const SUMMARY_BUDGET_MS = 26000;
const MIN_RETRY_WINDOW_MS = 8000;

function addUsage(total, usage) {
  if (!usage) return total;
  if (!total) return { input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 };
  return {
    input_tokens: total.input_tokens + (usage.input_tokens || 0),
    output_tokens: total.output_tokens + (usage.output_tokens || 0),
  };
}

// One call to the model. Never throws. validationFailed marks the only kind
// of failure worth retrying (the wording, not the API).
async function attemptOnce(facts, model, timeoutMs) {
  let response;
  try {
    const sdk = require('@anthropic-ai/sdk');
    const Anthropic = sdk.Anthropic || sdk.default || sdk;
    const client = new Anthropic({ timeout: timeoutMs, maxRetries: 0 });
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
    return { ok: false, reason: `API call failed (${error && (error.status || error.name)})` };
  }

  if (response.stop_reason !== 'end_turn') {
    return { ok: false, reason: `unexpected stop reason: ${response.stop_reason}`, usage: response.usage };
  }

  const text = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  const validation = validateSummary(text, facts);
  if (!validation.ok) {
    return { ok: false, validationFailed: true, reason: validation.reason, rejectedText: text, usage: response.usage };
  }
  return { ok: true, text, usage: response.usage };
}

// Never throws. Tries once, and once more only if the wording failed the
// output checks and there is time left. Returns {ok, text?, reason?, model,
// latencyMs, usage?, attempts, retryReasons}.
async function produceSummary(facts) {
  const model = process.env.AI_SUMMARY_MODEL || DEFAULT_MODEL;
  const started = Date.now();
  const finish = (fields) => ({ model, latencyMs: Date.now() - started, ...fields });

  if (!process.env.ANTHROPIC_API_KEY) {
    return finish({ ok: false, reason: 'ANTHROPIC_API_KEY is not set', attempts: 0, retryReasons: [] });
  }

  let usage = null;
  const retryReasons = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = SUMMARY_BUDGET_MS - (Date.now() - started);
    const result = await attemptOnce(facts, model, Math.min(SUMMARY_TIMEOUT_MS, remaining));
    usage = addUsage(usage, result.usage);
    const { usage: ignored, ...rest } = result;
    if (result.ok) return finish({ ...rest, usage, attempts: attempt, retryReasons });
    const canRetry =
      result.validationFailed && attempt === 1 && SUMMARY_BUDGET_MS - (Date.now() - started) >= MIN_RETRY_WINDOW_MS;
    if (!canRetry) return finish({ ...rest, usage, attempts: attempt, retryReasons });
    retryReasons.push(result.reason);
  }
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
