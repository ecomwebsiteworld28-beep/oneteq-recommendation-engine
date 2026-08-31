// ONETEQ Assessment API Endpoint
// This receives quiz answers from GHL and runs the real recommendation engine

const { runFullAssessmentWithPricing } = require('../index.js');

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests are allowed' });
  }

  try {
    const { answers: nestedAnswers, flags: nestedFlags, ...rest } = req.body;

    // GHL's webhook sends q3, q4, etc. flat at the top level instead of
    // nested under "answers" — fall back to collecting those if "answers"
    // wasn't provided.
    let answers = nestedAnswers;
    if (!answers) {
      answers = {};
      for (const [key, value] of Object.entries(rest)) {
        if (/^q\d+$/i.test(key)) {
          answers[key] = value;
        }
      }
    }

    if (!answers || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'Missing answers in request body' });
    }

    let flags = nestedFlags || {};

    // GHL can't send flags.goals as an array — it sends the main goal as
    // "q1_goal" and any extra goals as a comma-separated "q2_goals" string
    // (sometimes already an array) at the top level. Build flags.goals from
    // those when it wasn't already given as an array.
    if (!Array.isArray(flags.goals)) {
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

      addGoal(rest.q1_goal);

      if (Array.isArray(rest.q2_goals)) {
        rest.q2_goals.forEach(addGoal);
      } else if (typeof rest.q2_goals === 'string' && rest.q2_goals.trim()) {
        rest.q2_goals.split(',').forEach(addGoal);
      }

      flags = { ...flags, goals };
    }

    const result = runFullAssessmentWithPricing(answers, flags);

    return res.status(200).json({
      status: 'success',
      result: result
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}
