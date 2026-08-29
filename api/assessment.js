// ONETEQ Assessment API Endpoint
// This receives quiz answers from GHL and returns the full recommendation

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests are allowed' });
  }

  try {
    const { answers, flags } = req.body;

    if (!answers) {
      return res.status(400).json({ error: 'Missing answers in request body' });
    }

    // TEMPORARY: placeholder response while we connect the real engine
    // This confirms the endpoint itself works before we wire in the full logic
    return res.status(200).json({
      status: 'success',
      message: 'ONETEQ API endpoint is live and receiving data',
      receivedAnswers: answers,
      engineVersion: 'ONETEQ_RE_V3.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
