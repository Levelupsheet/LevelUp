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

function shorten(line: string, max = 110) {
  const cleaned = cleanLine(line).replace(/^[-•*]\s*/, "");
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

export function summarizeJobDescription(input: JobOpeningInput) {
  const description = String(input.description || "").replace(/
/g, "");
  const rawLines = description
    .split("
")
    .map(cleanLine)
    .filter(Boolean)
    .filter((line) => line.length > 18);

  const uniqueLines: string[] = [];
  for (const line of rawLines) {
    const normalized = line.toLowerCase();
    if (!uniqueLines.some((existing) => existing.toLowerCase() === normalized)) uniqueLines.push(line);
  }

  const keyLines = uniqueLines.filter((line) => /respons|require|experience|stack|skills|benefits|salary|remote|hybrid|onsite|cloud|aws|azure|security|network|clearance|certif/i.test(line));
  const picks = (keyLines.length ? keyLines : uniqueLines).slice(0, 6).map((line) => shorten(line, 110));

  const metaBits = [input.companyName, input.locationText, input.employmentType].filter(Boolean).join(' • ');
  const first = picks[0] || `${input.title || 'Role'} at ${input.companyName || 'Company'}`;
  const second = picks[1] || metaBits || 'See full description for responsibilities, requirements, and application details.';

  const summaryShort = `${shorten(first, 68)}${second ? ` • ${shorten(second, 58)}` : ''}`
    .replace(/[
]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 135);
  const summaryBullets = picks.slice(0, 4);

  return {
    summaryShort,
    summaryBullets,
  };
}
