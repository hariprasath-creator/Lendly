
// Centralized college-email validation for Lendly.
// The same function can be reused by authentication and item APIs.

const COLLEGE_EMAIL_REGEX =
  /^[a-zA-Z][a-zA-Z0-9_-]*\.\d{2}[a-zA-Z]{2,}@kongu\.edu$/;

// Normalize email addresses before validation and database queries.
function normalizeCollegeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Validate the expected format: name.YYbranch@kongu.edu.
// Example: hariprasathp.25it@kongu.edu
function isCollegeEmail(email) {
  const normalized = normalizeCollegeEmail(email);
  return COLLEGE_EMAIL_REGEX.test(normalized);
}

// Extract the joining year and branch from a valid email address.
function getStudentDetails(email) {
  const normalized = normalizeCollegeEmail(email);
  const match = normalized.match(
    /\.([0-9]{2})([a-z]{2,})@kongu\.edu$/
  );

  if (!match) {
    return { joiningYear: null, branch: null };
  }

  return {
    joiningYear: 2000 + Number(match[1]),
    branch: match[2].toUpperCase(),
  };
}

module.exports = {
  normalizeCollegeEmail,
  isCollegeEmail,
  getStudentDetails,
};
