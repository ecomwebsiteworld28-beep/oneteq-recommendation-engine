// AI-generated plain-English client summary.
//
// The engine's recommendation never changes here - this only EXPLAINS what
// has already been decided. Everything the model is told is built
// deterministically from the stored result (buildSummaryFacts), so it never
// sees raw scores, prices, names or contact details, and the summary is an
// addition to an assessment, never a dependency of it: nothing in this file
// throws to its callers, and the SDK is only loaded when a summary is
// actually generated, so a problem with it can't affect anything else.

const { CLASS_DISPLAY_NAMES } = require('./classNames.js');
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

// One client-friendly description per class. Foundation, Lift and Hybrid are from
// brief section 9 ("developer must use these"); the Circuits text is the client's
// own official wording, verbatim.
// ("developer must use these"). Foundation's and Circuits' emphasised rules
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
      'Lift always begins with a barbell lift, followed by a pair of weighted exercises done as a superset, and finishes with a final block of strength exercises.',
  },
  hybrid: {
    name: 'Hybrid',
    meaning:
      'Hybrid starts with a structured barbell lift and a weighted superset, then finishes with roughly 15 to 20 minutes of cardio and strength conditioning, sitting between Lift and Circuits.',
  },
  hyrox: {
    name: CLASS_DISPLAY_NAMES.hyrox, // internal key stays "hyrox"; see lib/classNames.js
    meaning:
      "Circuits is a full-body workout combining strength and cardio exercises in one varied, energetic session. You'll move through a series of stations designed to improve cardiovascular fitness, strength, stamina and muscular endurance. Each exercise can be adapted to suit your ability, allowing you to work at your own pace while still challenging yourself. With a mixture of functional strength and cardio exercises, Circuits is a simple, effective and enjoyable way to get fitter and stronger.",
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
const MAX_AREAS = 4;
const MAX_GAPS = 2;

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
  if (q5) return `You told us you would like to train ${q5} at GymTEQ.`;

  const q4 = perWeekPhrase(answers.q4);
  if (q4) return `You told us you would like to train ${q4} in total, including anything you do outside GymTEQ.`;

  const askedForAdvice = isAdviceRequest(answers.q5) || isAdviceRequest(answers.q4);

  if (recommendedPackage && recommendedPackage.membershipSuggested) {
    const suggested = (recommendedPackage.lineItems || []).find((item) => item.suggested);
    const match = suggested && String(suggested.name).match(/(\d+)\s*sessions\/month/i);
    const phrase = match && SESSIONS_PER_MONTH_PHRASE[Number(match[1])];
    if (phrase) {
      return `${askedForAdvice ? 'You asked us to recommend how often to train, and as' : 'As'} a starting point we would suggest ${phrase} at GymTEQ. The team will go through that with you.`;
    }
  }

  return askedForAdvice
    ? 'You asked us to advise on how often to train at GymTEQ, so we will go through that together.'
    : 'How often you train at GymTEQ each week is something to talk through with the team.';
}

const NO_AREAS_SENTENCE =
  'We need a bit more from you before we can say where support would help most, so we would like to go through that with you.';

// The support paragraph and the closing sentence are the two places every
// summary drifted into the same formula, and the model can't see other
// clients' summaries - so the wording approach is picked deterministically
// from the facts, which varies it from client to client.
const SUPPORT_PARAGRAPH_STYLES = [
  'Open with "On top of your sessions", and say these are things the team can go through with you if you feel they would be useful.',
  'Open with "Alongside your sessions", and say the team can go through these with you if you feel they would be useful.',
  'Open with "Beyond your sessions", and say these are things the team can talk through with you if you would find them useful.',
  'Open with "If it would help, the team can also", and go on to say the team can explain these in more detail.',
  'Open with "Something else the team can go through with you, if you would find it useful, is", and go on to name these.',
  'Open with "Separately from your sessions", and say the team can talk through these with you if you feel they would be useful.',
];
const CLOSING_STYLES = [
  'Close by inviting them to come in and have a chat with the team so all of this can be talked through together.',
  'Close by saying the team would be glad to talk it through whenever suits them.',
  'Close by inviting them to bring any questions to the team.',
  'Close by saying the next step is simply a conversation with the team.',
  'Close by inviting them to come and talk it over with the team.',
];

// Paragraph 2 is the other place summaries settled into one formula. Same fix
// as above: code picks the framing per client. None of these is the banned
// "stands to gain the most from some dedicated support".
const AREAS_LEAD_STYLES = [
  'Lead area: say it is the first thing we would suggest paying attention to, and why.',
  'Lead area: say that from what they told us, this is where we would put the most emphasis, and why.',
  'Lead area: say that their answers point first to this, and why it matters for them.',
  'Lead area: say this is the natural place to begin, and give the reason.',
  'Lead area: say this came through most clearly from their answers, and why it matters.',
];
const AREAS_FOLLOW_ON_STYLES = [
  'Next areas: say they could also help them get more out of their training.',
  'Next areas: say a bit of support here would build well on the first.',
  'Next areas: say they are also relevant to what the client gave us, as topics and not as services.',
  'Next areas: say they also featured in the client\'s answers.',
  'Next areas: say they sit naturally alongside the first, in one sentence.',
];
const GAP_PHRASE_STYLES = [
  'Missing information: say "we don\'t have quite enough detail yet, so we\'ll go through that with you", in your own words.',
  'Missing information: say we do not yet have enough on it, and that we will go through it with them.',
  'Missing information: say we do not yet have the full picture on it, so it is something to go through together.',
  'Missing information: say we would like to understand it better, which we can do when we talk it through with them.',
];
// These describe what WE lack. They must never read as something the client
// said (same rule as the code-written frequency sentence); enforced in
// validateSummary via GAP_ATTRIBUTION.

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
    if (id.startsWith('physio_')) add('physiotherapy at PhysioTEQ');
    else if (id.startsWith('nutrition_')) add('nutrition support with the ONETEQ Health team');
    else if (id === 'sports_massage') add('sports massage and recovery work at PhysioTEQ');
    else if (['vo2_metabolic', 'endurance_metabolic', 'rmr_test', 'deep_dive'].includes(id)) {
      add('fitness and metabolic testing with the ONETEQ Health team');
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
    .map((goal) => goal.replace(/\bas I get older\b/i, 'for the long term'))
    // The class is now called Circuits; a goal about the sport itself is kept but not named.
    .map((goal) => goal.replace(/\bHYROX(?:-style)?\b/gi, 'fitness racing'));
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
    // Paragraph 2 names a lead area plus at most three more and at most two
    // gaps. Handing the model every axis just made it list them all.
    areas: areas.slice(0, MAX_AREAS),
    // With no areas at all, paragraph 2 is the fixed sentence; listing the
    // gaps too tempts the model to write its own version instead.
    notEnoughInformation: areas.length === 0 ? [] : notEnoughInformation.slice(0, MAX_GAPS),
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
    // Salted so each pick moves independently of the others.
    areasLead: AREAS_LEAD_STYLES[stableIndex(`${seed}|lead`, AREAS_LEAD_STYLES.length, true)],
    areasFollowOn: AREAS_FOLLOW_ON_STYLES[stableIndex(`${seed}|follow`, AREAS_FOLLOW_ON_STYLES.length, true)],
    gapPhrase: GAP_PHRASE_STYLES[stableIndex(`${seed}|gap`, GAP_PHRASE_STYLES.length, true)],
  };
  return facts;
}

const SYSTEM_PROMPT = `You are writing a short personal summary for a client of ONETEQ Health, a physiotherapy and personal-training business. Training happens at GymTEQ and physiotherapy and clinical treatment happen at PhysioTEQ. Our team has already assessed the client and decided their recommendation. Your job is only to explain that decision in warm, plain English. You never make, change or question the recommendation.

Voice: write as the ONETEQ team ("we"), speaking directly to the client ("you"), the way an experienced physio and coach would talk to someone in the clinic: calm, practical, plain-spoken, never salesy. British spelling. No exclamation marks, emojis, headings, bullet points or markdown. Never use marketing language or filler: not "journey", "unlock", "transform", "game-changer", "a great match", "a great fit", "lends itself", "a real event","make a real difference", "real value", "add-ons", "musts", or any form of "stand out" ("stands out", "stood out", "standing out"). Support is something the team can go through with you. Never mention AI, scores, algorithms, the questionnaire, or "the system".

Write 3 to 4 short paragraphs, 150 to 210 words in total (be concise; the total must never exceed 230 words, so if it is running long, shorten paragraph 1 and drop the least relevant areas from paragraph 2 rather than going over), covering in this order:
1. Why this class suits them. Name the class, say in one sentence what it involves (use the meaning provided, in your own words), and connect it to the goals they told us about. Open with the class as our recommendation, then describe what a session involves, then tie it to their goals in one sentence that names their goals (up to four; if they gave more, group similar ones rather than listing every one) and says why this structure suits them, in the manner of "Given that you're looking to get stronger and build muscle, this structure gives you a solid strength foundation to build all of that from" (adapt the reasoning to what the class's meaning actually says; never claim more than it does). If startedAtFoundationByDesign is true, explain that starting here is deliberate: we build a sound base first, then progress them towards the class named in progressingToward, in a single short sentence. Paragraph 1 as a whole is at most four sentences.
2. What we picked up. If noAreasSentence is present, this paragraph is that sentence, word for word, and nothing else. Otherwise write this paragraph as flowing prose, never a list. The "areas" list is ordered from most to least relevant. Lead with the first area, framed as styleNotes.areasLead says, and in the same sentence or the next say why it matters for this client, giving the reasoning in plain terms. Then, in a second sentence, add the next areas from the list as styleNotes.areasFollowOn says, never more than three areas in any one sentence, and only as many as are useful. Handle anything under notEnoughInformation inline, in the same conversational voice, as styleNotes.gapPhrase says. A gap is only ever something WE lack information on: never say or imply the client mentioned, told us, said, wanted, raised or hoped for anything about it, and never use "you mentioned", "you told us" or "your answers" in a sentence that names a gap (name at most two such gaps; if more are missing, name two and leave the rest for the team to go through with them, and do not list them). Across the whole paragraph, name at most four areas in total, and never more than three in any one sentence: a sentence that would name four must be shortened, not stretched. Use the framings in styleNotes in your own words rather than copying stock phrases, and do not fall back on "Alongside that" or "could also help you get more out of your training" unless a styleNotes framing itself uses them. Never describe any area as a lower priority, less important or less of a priority: an area that is less relevant is simply left out, or covered by the team going through it with them. Never use the phrase "stands to gain the most from some dedicated support" or any close variant of it.
3. How often to train. This paragraph is frequencySentence, copied word for word, and nothing else. Do not paraphrase it, add to it, or say anything else about how often they will train.
4. Support that looks relevant. Only if supportAreas is not empty: mention only the supportAreas provided, in one conversational, low-pressure sentence that opens and is framed exactly as styleNotes.supportParagraph says. Add nothing beyond that framing (no remarks about pace, choice or it being their call). If supportAreas is empty, leave this paragraph out entirely.
Finish with one sentence, following styleNotes.closing, that points them to a conversation with the team. It always stands alone as its own final paragraph, separated by a blank line, and is never joined onto the support paragraph or any other paragraph. No other call to action, and no contact details.

Hard rules:
- ABSOLUTE: never describe any arrangement, service, agreement, plan, appointment or commitment that the facts do not contain. Never say or imply that anything has been agreed, arranged, booked, set up or promised, and never mention check-ins, monitoring, reviews or follow-ups. Do not say what we will do with anything the client told us (for example "that is what we will work around", "we have noted this", "we will keep an eye on"). The only thing you may say the team will do is talk things through with them.
- Describe each class using only what its meaning says. Do not add anything to it (for example, do not say a class includes cardio unless its meaning says so).
- Names of places and teams: Foundation, Lift, Hybrid and Circuits are GymTEQ classes, and training happens at GymTEQ, so whenever you say where training happens, say GymTEQ (never "ONETEQ" as a place). Physiotherapy, clinical support and recovery support happen at PhysioTEQ: when you mention any of these, name PhysioTEQ at least once in the summary. Nutrition support and fitness and metabolic testing are provided by the ONETEQ Health team: when you mention either, say "the ONETEQ Health team", and never attach GymTEQ or PhysioTEQ to them. Everything else, including the closing, is simply "the team". Never use "ONETEQ" on its own as a name; the only form allowed is "ONETEQ Health team".
- Stay strictly within the class meaning. Do not characterise a class beyond it: no claims about what it mirrors, simulates, reflects, prepares you for or feels like, and no added benefits. When tying a class to goals, the reasoning may only rest on what the meaning says the class involves.
- Do not compare classes by intensity, difficulty or level, and do not call any class easier, harder, gentler, tougher or more or less demanding. Describe what each class involves and nothing more.
- The relevance labels (lower, moderate, high, very high) show how relevant an area is to this client, meaning how much support would help there. They are NOT a measure of how good or bad the client is. Never frame a high label as a weakness or failing, and never frame a lower one as a pass or a strength. Use them only to decide emphasis, never quote a label, and never call an area "high" or "low". Talk about what support would help, not how well they are doing.
- Never say or imply that Foundation is for older people, and do not mention age at all.
- Never say or imply that Circuits is only for very fit, elite or advanced people.
- The four classes are Foundation, Lift, Hybrid and Circuits. Use only the class names given in the facts.
- Use only the facts provided. If something is missing, do not guess; say the team will confirm it.
- Only mention returning to exercise after having a baby if returningToExerciseAfterHavingABaby is true.
- Never state or imply a price, cost, fee, discount, package, membership or tier, and never use a currency symbol.
- Do not diagnose, give medical advice, comment on any injury or condition beyond what the facts state, or promise outcomes.
- Only ever offer or name a service, session, test, treatment, plan or product that appears in supportAreas. The areas in "areas" and "notEnoughInformation" are topics to talk about, never services we provide: do not name any specific service that is not in supportAreas (for example a treatment, a scan, a test, a plan, a check-in or a consultation), and never say a service is "available", or that we "offer" or "provide" it.
- In the paragraph about what we picked up, areas are topics, not offers. Say that support in an area "would help" or that it "came through" in their answers. Never say the team "can help with", "can cover", "can support" or "can look at" an area, never say there is "scope" to do so, and never put an area in a sentence that offers it unless it appears in supportAreas.
- Always speak to the client as "you". Never refer to them as "they", "them" or "the client" (so never "if they feel...").
- A higher relevance never means a problem or a deficit. Never say an area "needs addressing", "needs attention" or "needs fixing", never say there is "a need for" anything, that the client is "in need of" something, or that something "would need" doing. Say only that support in that area would help, or that the team can go through it.
- Never promise or imply an outcome. A class or an area never gives the client a "route", "path" or "direct way" to a goal, and nothing is "guaranteed". Describe what the class involves and say that its structure suits the goals the client gave us.
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
  // Comparing classes by level is forbidden. "easier/harder/tougher/gentler" followed by "to" is about the
  // client's own habits ("makes it easier to keep training"), not about a class, so it is allowed;
  // "easier than Lift", "an easier class" and "harder sessions" are still rejected.
  ['class ranking wording', /\b(intens(?:e|ity|ive)|(?:harder|easier|tougher|gentler)(?!\s+to\b)|gentle|more demanding|less demanding|difficult\w*)\b/i],
  ['banned phrase', /\b(great match|real difference|real value|add-?ons?|musts?|need to commit|stands? out|game-?changer|journey|unlock\w*|transform\w*)\b/i],
  ['banned phrase', /\bstand(?:s|ing)? to gain\b|\bdedicated\b/i],
  ['company name', /\bONETEQ\b(?!\s+Health\b)/i],
  ['old class name', /\bhyrox\b/i],
  // We describe what the team can go through with the client; we never advertise availability.
  // Also the disguised forms ("...testing are there too", "on offer", "on hand"), which say the same thing.
  ['availability claim', /\bavailable\s+(?:through|at|from|via|with|to you)\b|\bwe\s+(?:also\s+)?(?:offer|provide)\b|\bare\s+there\b|\bon\s+offer\b|\bon\s+hand\b/i],
  // The client is "you". "if they feel" / "the client" means the instructions leaked into the text.
  ['client in the third person', /\bif they (?:feel|find|like|want|prefer|choose|decide|would like)\b|\bthe client(?:['’]s)?\b/i],
  // Brief: higher relevance means more support would help, never a deficit or a problem.
  [
    'deficit framing',
    /\b(?:needs?|needed|requires?|required)\s+(?:to be\s+)?(?:addressing|addressed|attention|fixing|fixed|working on|treating|treated|improving|correcting)\b|\b(?:a|the)\s+need\s+for\b|\bin\s+need\s+of\b|\bwould\s+need\s+(?:addressing|attention|to be)\b|\bproblems?\s+(?:with|in)\b|\bholding\s+you\s+back\b/i,
  ],
  // No promised outcomes: a class gives a structure, not a route to a goal.
  ['outcome promise', /\b(?:direct|clear|fastest|quickest|surest|guaranteed|straight)\s+(?:route|path|way)\b|\bguarantee\w*\b|\b(?:route|path)\s+(?:to|towards)\b/i],
  // "worth" is never used (it kept creeping in as "worth going through" and similar).
  ['"worth" phrasing', /\bworth\b/i],
  // Brand attached to areas the client has not yet confirmed belong to one.
  // Brand ownership (confirmed by the client): nutrition and metabolic testing are the ONETEQ Health team's,
  // recovery is PhysioTEQ's. Never GymTEQ or PhysioTEQ on nutrition/testing, never GymTEQ on recovery.
  [
    'wrong brand on an area',
    /\b(?:nutrition|metabolic)(?:\s+(?:support|testing|work|advice))?\s+(?:at|with|from|through)\s+(?:GymTEQ|PhysioTEQ)\b|\b(?:GymTEQ|PhysioTEQ)(?:['’]s)?\s+(?:nutrition|metabolic)\b|\brecovery(?:\s+(?:support|work|advice))?\s+(?:at|with|from|through)\s+GymTEQ\b|\bGymTEQ(?:['’]s)?\s+recovery\b/i,
  ],
  ['banned phrase', /\bgreat fit\b|\blend(?:s|ing)? (?:itself|themselves)\b/i],
  // Claims about a class that go beyond its stated meaning.
  ['class over-promise', /\bbuild(?:s|ing)? (?:up )?towards a real\b|\breal[- ](?:world )?(?:event|race)s?\b|\bevent demands\b|\bmirrors?\b|\bsimulat\w*/i],
  // Brief: higher relevance = more support would help; lower never means unimportant.
  [
    'lower-priority framing',
    /\b(?:less(?:er)?|lower|low|not a|not much of a)[- ](?:of a )?priorit(?:y|ies)\b|\bless important\b|\bunimportant\b|\bworth keeping in mind\b|\bnot (?:a )?(?:main |major )?(?:focus|concern)\b/i,
  ],
];

// One pattern per support axis, for counting how many areas a sentence names.
const AREA_TERMS = [
  /\b(?:coaching|programming|technique)\b/i,
  /\b(?:structure|accountability)\b/i,
  /\b(?:physiotherapy|clinical)\b/i,
  /\bnutrition\b/i,
  /\b(?:performance|event focus)\b/i,
  /\brecovery\b/i,
];

// Words that credit the client with having said, wanted or raised something.
const GAP_ATTRIBUTION =
  /\b(?:mention(?:ed|ing)?|told us|tell us|you(?:['’]ve)? (?:said|shared|raised|indicated|noted|want(?:ed)?|wish(?:ed)?)|you(?:['’]re| are) (?:hoping|wanting|looking)|wanting|hoping|from what you|what you(?:['’]ve)? (?:told|said|shared))\b/i;

const FREQUENCY_CLAIM = /\b(?:once|twice|(?:two|three|four|five|\d+) or more times|(?:two|three|four|five) times) a week\b/i;

// Hard limits on the finished text. The prompt asks for 230 words or fewer; this is the safety
// net, set high enough that a good, slightly long summary is kept (a rejected one leaves the
// client with no summary at all).
const MIN_WORDS = 90;
const MAX_WORDS = 280;

// Specific services a summary may only name when they are in that contact's own recommended
// list (facts.supportAreas, built from the Recommended tier). Axis areas such as "physiotherapy
// and clinical support" or "recovery support" are topics to discuss, not services, so they are
// not listed here. Anything unlisted that appears is a service the client was never offered.
const SERVICE_LICENCES = [
  ['massage', /\bmassage\b/i, /massage/i],
  ['fitness or metabolic testing', /\b(?:vo2|rmr|metabolic|body composition|deep dive|dexa|fitness test(?:ing|s)?|endurance test(?:ing|s)?)\b/i, /testing/i],
  ['one-to-one coaching', /\bone-to-one\b|\b1:1\b|\bpersonal training\b|\bpersonal trainer\b/i, /one-to-one coaching/i],
  ['nutrition plans or packages', /\b(?:meal plans?|nutrition (?:plan|programme|package|consultation|coaching|app)s?|food diary)\b/i, /nutrition/i],
  ['physiotherapy sessions or treatment', /\b(?:physio(?:therapy)? (?:session|appointment|treatment|assessment|follow-?up)s?|physiotherapy at PhysioTEQ)\b/i, /physiotherapy/i],
  ['a director consultation', /\bdirector\b/i, null], // never offered in a summary
  ['progress check-ins or reviews', /\bprogress (?:check-?in|review)s?\b|\bprogramme review\b/i, null],
  ['scans or screening', /\b(?:scan|scans|screening|x-?ray|mri)\b/i, null],
];

// An "offer" sentence says the team (or PhysioTEQ) can do something for the client. Everything it names must be
// in that contact's own recommended list. Areas can still be discussed as topics ("came through", "would help",
// "we'll go through that with you"); they just cannot be offered. Accountability and performance have no product
// behind them, so they can never be offered.
const OFFER =
  /\b(?:the (?:ONETEQ Health )?team|our team|PhysioTEQ|we)\s+(?:can|could|are able to|will be able to)\s+(?:also\s+)?(?:help|support|assist|cover|provide|bring in|look at|point you|put you in touch|arrange|set up|work on|go through|talk through|talk you through|explain)\b|\b(?:somewhere|something|an area|areas|places?|where)\s+(?:that\s+)?(?:the (?:ONETEQ Health )?team|we|PhysioTEQ)\s+can\b|\bscope\s+(?:for|to)\b/i;
// Same order as AREA_TERMS / AXIS_AREAS: coaching, accountability, clinical, nutrition, performance, recovery.
const AREA_LICENCES = [/one-to-one coaching/i, null, /physiotherapy/i, /nutrition/i, null, /massage/i];

// Returns the first area or service that an offer sentence names without it being in the recommendation, or null.
function findUnlicensedOffer(text, facts) {
  const offered = (facts && facts.supportAreas) || [];
  for (const sentence of text.split(/(?<=[.?])\s+/)) {
    if (!OFFER.test(sentence)) continue;
    for (let i = 0; i < AREA_TERMS.length; i += 1) {
      if (!AREA_TERMS[i].test(sentence)) continue;
      const licence = AREA_LICENCES[i];
      if (!(licence && offered.some((area) => licence.test(area)))) return AXIS_AREAS[i][1];
    }
    const service = findUnlicensedService(sentence, facts);
    if (service) return service;
  }
  return null;
}

// Returns the name of the first service the text names that this contact's recommendation does not license.
function findUnlicensedService(text, facts) {
  const offered = (facts && facts.supportAreas) || [];
  for (const [name, mention, licence] of SERVICE_LICENCES) {
    if (mention.test(text) && !(licence && offered.some((area) => licence.test(area)))) return name;
  }
  return null;
}

// facts is optional; when given, the code-written sentences must be
// present verbatim and frequency must not be mentioned anywhere else.
function validateSummary(text, facts) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty' };
  const words = text.trim().split(/\s+/).length;
  if (words < MIN_WORDS || words > MAX_WORDS) return { ok: false, reason: `length out of range (${words} words)` };
  for (const [name, pattern] of OUTPUT_RULES) {
    const hit = text.match(pattern);
    // matched = the exact words that tripped the rule, so a retry can be told what to avoid.
    if (hit) return { ok: false, reason: `failed check: ${name}`, rule: name, matched: hit[0] };
  }
  if (facts) {
    if (facts.frequencySentence && !text.includes(facts.frequencySentence)) {
      return { ok: false, reason: 'frequency sentence not included verbatim' };
    }
    if (facts.noAreasSentence && !text.includes(facts.noAreasSentence)) {
      return { ok: false, reason: 'no-areas sentence not included verbatim' };
    }
    // The closing must stand alone as its own one-sentence final paragraph.
    const paragraphs = text.trim().split(/\n\s*\n/);
    const closing = paragraphs[paragraphs.length - 1];
    if (paragraphs.length < 4 || (closing.match(/[.?](?:\s|$)/g) || []).length > 1) {
      return { ok: false, reason: 'closing sentence is not its own final paragraph' };
    }
    // Paragraph 2 (the areas): never more than three areas in one sentence.
    if (!facts.noAreasSentence && paragraphs[1]) {
      // AREA_TERMS follows the AXIS_AREAS order.
      const gapTermIndexes = (facts.notEnoughInformation || [])
        .map((label) => AXIS_AREAS.findIndex(([, axisLabel]) => axisLabel === label))
        .filter((index) => index >= 0);
      for (const sentence of paragraphs[1].split(/(?<=[.?])\s+/)) {
        const named = AREA_TERMS.filter((term) => term.test(sentence)).length;
        if (named > 3) return { ok: false, reason: 'more than three areas in one sentence' };
        // A sentence naming an area we lack information on must not credit the client with saying anything about it.
        const namesGap = gapTermIndexes.some((index) => AREA_TERMS[index].test(sentence));
        if (namesGap && GAP_ATTRIBUTION.test(sentence)) {
          return { ok: false, reason: 'gap described as something the client said' };
        }
      }
    }
    const unlicensed = findUnlicensedService(text, facts);
    if (unlicensed) return { ok: false, reason: `names a service not in this client's recommendation: ${unlicensed}` };
    const offered = findUnlicensedOffer(text, facts);
    if (offered) return { ok: false, reason: `offers something not in this client's recommendation: ${offered}` };
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
// Up to three attempts. A retry is not a blind resample: it is told which words were
// rejected and why (see buildRetryMessages), which is what makes the later attempts work.
const MAX_ATTEMPTS = 3;

// Plain-language instruction for each output check, given back to the model when a draft is rejected.
const RETRY_HINTS = {
  'class ranking wording': 'Do not compare the classes, and do not call any class easier, harder, tougher, gentler, intense, difficult or more or less demanding. Describe what each class involves instead.',
  '"worth" phrasing': 'Do not use the word "worth" anywhere.',
  'banned phrase': 'Remove that phrase. Do not use "dedicated" (in any form), "great fit", "lends itself", "journey", "unlock", "transform" or similar marketing language.',
  'availability claim': 'Do not say anything is "available", "there", "on offer" or "on hand", and do not say we "offer" or "provide" anything. Say only what the team can go through with the client.',
  'deficit framing': 'Do not say an area needs addressing or attention, or that there is a need for something. A higher relevance means support would help there, not that there is a problem.',
  'outcome promise': 'Do not promise or imply an outcome, and do not describe a "route" or "path" to a goal.',
  'client in the third person': 'Speak to the client as "you" throughout. Never "they", "them" or "the client".',
  'asserted arrangement': 'Do not say anything has been agreed, arranged, booked, noted or planned. The only thing the team will do is talk things through with the client.',
  'good/bad framing': 'Do not describe the client or an area as weak, poor, bad or failing. Relevance is not quality.',
  'lower-priority framing': 'Do not describe any area as a lower priority or less important.',
  'old class name': 'Use only the class names given in the facts.',
  'company name': 'Do not use "ONETEQ" on its own; the only form allowed is "ONETEQ Health team".',
  'wrong brand on an area': 'Nutrition and fitness and metabolic testing are with the ONETEQ Health team, recovery is at PhysioTEQ. Do not attach any other brand to them.',
};

// What to tell the model about one rejected draft. `validation` is validateSummary's failure result.
function retryHint(validation) {
  const { reason = '', rule } = validation || {};
  if (rule && RETRY_HINTS[rule]) return RETRY_HINTS[rule];
  const length = reason.match(/length out of range \((\d+) words\)/);
  if (length) {
    return Number(length[1]) > MAX_WORDS
      ? 'It was too long. Keep the whole summary under 230 words: shorten paragraph 1 and mention fewer areas.'
      : 'It was too short. Write at least 150 words.';
  }
  if (/frequency sentence not included/.test(reason)) return 'Include the frequencySentence exactly as given, as its own paragraph.';
  if (/no-areas sentence not included/.test(reason)) return 'The areas paragraph must be exactly the noAreasSentence, word for word.';
  if (/closing sentence/.test(reason)) return 'End with a single sentence on its own, as a separate final paragraph.';
  if (/more than three areas/.test(reason)) return 'Never name more than three areas in one sentence. Split it or drop the least relevant.';
  if (/gap described/.test(reason)) return 'Gaps are things we lack information on. Never say the client mentioned, told us or said anything about them.';
  if (/names a service not in/.test(reason)) return 'Only name services that are listed in supportAreas.';
  if (/offers something not in/.test(reason)) return 'Areas can be discussed as topics but not offered. Do not say the team can help with, cover or go through an area unless it is in supportAreas.';
  if (/frequency mentioned outside/.test(reason)) return 'Do not mention how often to train anywhere except in the frequencySentence.';
  return 'Fix that and keep to every other rule.';
}

// The conversation for a retry: the facts, the rejected draft, then what was wrong with it.
// earlier = hints from drafts rejected before the latest one, so a third attempt avoids all of them.
function buildRetryMessages(facts, previous) {
  const first = { role: 'user', content: JSON.stringify(facts, null, 2) };
  if (!previous) return [first];
  const what = previous.matched ? `it contained "${previous.matched}"` : `it failed a check (${previous.reason})`;
  const earlier = (previous.earlier || []).length ? ` Earlier drafts were also rejected, so avoid these too: ${previous.earlier.join(' ')}` : '';
  const feedback = `That draft was rejected and cannot be used: ${what}. ${previous.hint}${earlier} Write a complete new summary that fixes this and still follows every other rule and instruction.`;
  if (!previous.rejectedText) return [{ role: 'user', content: `${first.content}\n\n${feedback}` }];
  return [first, { role: 'assistant', content: previous.rejectedText }, { role: 'user', content: feedback }];
}

function addUsage(total, usage) {
  if (!usage) return total;
  if (!total) return { input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 };
  return {
    input_tokens: total.input_tokens + (usage.input_tokens || 0),
    output_tokens: total.output_tokens + (usage.output_tokens || 0),
  };
}

// The real model call (the SDK is only loaded here, when a summary is actually generated).
async function callModel(model, timeoutMs, messages) {
  const sdk = require('@anthropic-ai/sdk');
  const Anthropic = sdk.Anthropic || sdk.default || sdk;
  const client = new Anthropic({ timeout: timeoutMs, maxRetries: 0 });
  return client.messages.create({
    model,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT,
    messages,
  });
}

// One call to the model. Never throws. validationFailed marks the only kind
// of failure worth retrying (the wording, not the API). previous is the
// rejected draft being retried, if any. createMessage is replaceable for tests.
async function attemptOnce(facts, model, timeoutMs, previous, createMessage = callModel) {
  let response;
  try {
    response = await createMessage(model, timeoutMs, buildRetryMessages(facts, previous));
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
    return {
      ok: false,
      validationFailed: true,
      reason: validation.reason,
      hint: retryHint(validation),
      matched: validation.matched,
      rejectedText: text,
      usage: response.usage,
    };
  }
  return { ok: true, text, usage: response.usage };
}

// Never throws. Up to MAX_ATTEMPTS attempts; each retry happens only if the wording
// failed the output checks and there is time left, and is told what was wrong with the
// previous draft. Returns {ok, text?, reason?, model, latencyMs, usage?, attempts,
// retryReasons, retryMatches}. deps.createMessage replaces the model call in tests.
async function produceSummary(facts, deps = {}) {
  const model = process.env.AI_SUMMARY_MODEL || DEFAULT_MODEL;
  const started = Date.now();
  const finish = (fields) => ({ model, latencyMs: Date.now() - started, ...fields });

  if (!process.env.ANTHROPIC_API_KEY) {
    return finish({ ok: false, reason: 'ANTHROPIC_API_KEY is not set', attempts: 0, retryReasons: [] });
  }

  let usage = null;
  const retryReasons = [];
  const retryMatches = [];
  let previous = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = SUMMARY_BUDGET_MS - (Date.now() - started);
    const result = await attemptOnce(facts, model, Math.min(SUMMARY_TIMEOUT_MS, remaining), previous, deps.createMessage);
    usage = addUsage(usage, result.usage);
    const { usage: ignored, ...rest } = result;
    if (result.ok) return finish({ ...rest, usage, attempts: attempt, retryReasons, retryMatches });
    const canRetry =
      result.validationFailed &&
      attempt < MAX_ATTEMPTS &&
      SUMMARY_BUDGET_MS - (Date.now() - started) >= MIN_RETRY_WINDOW_MS;
    if (!canRetry) return finish({ ...rest, usage, attempts: attempt, retryReasons, retryMatches });
    retryReasons.push(result.reason);
    retryMatches.push(result.matched || null);
    previous = {
      rejectedText: result.rejectedText,
      reason: result.reason,
      matched: result.matched,
      hint: result.hint,
      earlier: previous ? [...(previous.earlier || []), previous.hint] : [],
    };
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
  buildRetryMessages,
  retryHint,
  MAX_ATTEMPTS,
  produceSummary,
  generateAndStoreSummary,
  parseStoredResult,
  SYSTEM_PROMPT,
  CLASS_INFO,
  relevanceBand,
};
