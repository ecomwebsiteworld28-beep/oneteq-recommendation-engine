// Display names for the four classes: the one place a class label is spelled.
//
// The engine's internal keys (foundation / lift / hybrid / hyrox) are NOT
// display names. They are scoring keys and they are what gets stored in the
// GoHighLevel class_match field and in Assessment_Raw_Response, so they must
// not change: GHL workflows filter on them. Renaming a class for clients
// means changing the label here only.

const CLASS_DISPLAY_NAMES = {
  foundation: 'Foundation',
  lift: 'Lift',
  hybrid: 'Hybrid',
  hyrox: 'Circuits', // client-facing name for the conditioning class; stored key stays "hyrox"
};

function classDisplayName(key) {
  return CLASS_DISPLAY_NAMES[key] || (key ? String(key) : '');
}

// Summaries written before the rename are stored in GHL with the old name in
// the text. Until they are regenerated, show them under the new name rather
// than leak the old one to clients.
function renameLegacyClassName(text) {
  return String(text ?? '').replace(/\bHYROX\b/gi, 'Circuits');
}

module.exports = { CLASS_DISPLAY_NAMES, classDisplayName, renameLegacyClassName };
