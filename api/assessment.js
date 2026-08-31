// ONETEQ Assessment API Endpoint
// This receives quiz answers from GHL and runs the real recommendation engine

const { runFullAssessmentWithPricing } = require('../index.js');

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests are allowed' });
  }

  try {
    const { answers: nestedAnswers, flags, ...rest } = req.body;

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

    const result = runFullAssessmentWithPricing(answers, flags || {});

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
