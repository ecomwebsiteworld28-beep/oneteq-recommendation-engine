// Sample stored results for tests and local previews. The prices are
// deliberately distinctive (4817, 912.5) so a test can prove they never
// reach the client page.

const PRICED_PACKAGE = {
  recommendedPackage: {
    recurringMonthlyTotal: 4817,
    oneOffTotal: 912.5,
    membershipSuggested: true,
    lineItems: [
      { name: 'Membership 8 sessions/month', billing: 'monthly', price: 4817, suggested: true },
      { name: 'Initial assessment', billing: 'one-off', price: 912.5 },
    ],
  },
  tieredPackages: {
    recommended: {
      lineItems: [{ productId: 'physio_followup', name: 'Physio follow-up', price: 4817, discountedPrice: 912.5 }],
    },
  },
};

const FOUNDATION = {
  name: 'Sample Foundation',
  result: {
    classMatch: { bestStartingMatch: 'foundation', overrideApplied: true, note: 'Foundation Starting Override applied' },
    classScores: { foundation: 20, lift: 18, hybrid: 22, hyrox: 8 },
    axes: {
      training: { score: 6 },
      coaching: { score: 8.5 },
      accountability: { score: 7 },
      clinicalSupport: { score: 3.5 },
      nutritionSupport: { score: 5 },
      performanceFocus: { score: 2 },
      recoverySupport: { score: null, unresolved: true },
    },
    ptNeed: { band: 'MODERATE' },
    ...PRICED_PACKAGE,
  },
  aiSummary:
    "We've recommended Foundation to start, a coached strength and general-fitness class that follows a similar structure to Lift.\n\nFrom what you told us, coaching support with programming and technique is where we would put the most emphasis. As for recovery support, we don't have quite enough detail yet, so we'll go through that with you.\n\nYou told us you would like to train twice a week at GymTEQ.\n\nThe team would be glad to talk it through whenever suits you.",
};

const LIFT = {
  name: 'Sample Lift',
  result: {
    classMatch: { bestStartingMatch: 'lift', overrideApplied: false },
    classScores: { foundation: 10, lift: 24, hybrid: 15, hyrox: 6 },
    axes: {
      training: { score: 9 },
      coaching: { score: 4 },
      accountability: { score: 2 },
      clinicalSupport: { score: 9.5 },
      nutritionSupport: { score: 6 },
      performanceFocus: { score: 7.5 },
      recoverySupport: { score: 5 },
    },
    ptNeed: { band: 'HIGH' },
    ...PRICED_PACKAGE,
  },
  aiSummary: '',
};

const LIFT_WITH_SUMMARY = {
  name: 'Sample Lift Summary',
  result: { ...LIFT.result },
  aiSummary:
    "Lift is the class we've recommended for you. Each session starts with a barbell lift, moves into a pair of weighted exercises done as a superset, and finishes with a final block of strength exercises. Given that you're looking to get stronger and build muscle, this structure gives you a solid strength foundation to build all of that from.\n\nFrom what you told us, physiotherapy and clinical support at PhysioTEQ is where we would put the most emphasis, since it keeps your training sustainable as you build up. Performance and event focus, and nutrition support, also featured in your answers. We'd like to understand your recovery better, which we can do when we talk it through with you.\n\nYou told us you would like to train twice a week at GymTEQ.\n\nBeyond your sessions, nutrition support with the ONETEQ Health team is something the team can talk through with you if you would find it useful.\n\nThe next step is simply a conversation with the team.",
};

const HYROX_UNRESOLVED = {
  name: 'Alexandria Montgomery-Featherstonehaugh',
  result: {
    classMatch: { bestStartingMatch: 'hyrox', overrideApplied: false },
    classScores: { foundation: 4, lift: 6, hybrid: 12, hyrox: 31 },
    axes: {
      training: { score: 10 },
      coaching: { score: null, unresolved: true },
      accountability: { score: null, unresolved: true },
      clinicalSupport: { score: 1 },
      nutritionSupport: { score: 3 },
      performanceFocus: { score: 9 },
      recoverySupport: { score: null, unresolved: true },
    },
    ptNeed: { unresolved: true },
    ...PRICED_PACKAGE,
  },
  aiSummary: 'Circuits is the class we have recommended for you.\n\nThe team would be glad to talk it through whenever suits you.',
};

const NO_CLASS = {
  name: '<script>alert(1)</script> Tester',
  result: {
    axes: {},
    ...PRICED_PACKAGE,
  },
  aiSummary: '',
};

module.exports = { FOUNDATION, LIFT, LIFT_WITH_SUMMARY, HYROX_UNRESOLVED, NO_CLASS, ALL: [FOUNDATION, LIFT, LIFT_WITH_SUMMARY, HYROX_UNRESOLVED, NO_CLASS] };
