export type JobOpeningInput = {
  title?: string | null;
  companyName?: string | null;
  locationText?: string | null;
  employmentType?: string | null;
  salaryText?: string | null;
  description?: string | null;
  applyUrl?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
};

function cleanLine(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function summarizeJobDescription(input: JobOpeningInput) {
  const description = String(input.description || "").replace(//g, "");
  const lines = description
    .split("
")
    .map(cleanLine)
    .filter(Boolean)
    .filter((line) => line.length > 18);

  const keyLines = lines.filter((line) => /respons|require|experience|stack|skills|benefits|salary|remote|hybrid|onsite|cloud|aws|azure|security|network/i.test(line));
  const picks = (keyLines.length ? keyLines : lines).slice(0, 5);
  const summaryShort = picks.slice(0, 2).join(" • ").slice(0, 240);
  const summaryBullets = picks.map((line) => line.replace(/^[-•*]\s*/, "")).slice(0, 6);
  return {
    summaryShort: summaryShort || `${input.title || "Role"} at ${input.companyName || "Company"}`,
    summaryBullets,
  };
}
