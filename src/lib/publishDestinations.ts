import { canonicalTrainingTarget } from './contentPools';

export function trainingDestinations(catalog: any[], placements: any[], sets: any[]) {
  const destinations = new Map<string, { industry: string; careerPath: string }>();
  for (const row of [...catalog, ...sets, ...placements.filter(p => p.lane === 'TRAINING')]) {
    const target = canonicalTrainingTarget(row);
    if (target.industry && target.careerPath) destinations.set(JSON.stringify([target.industry, target.careerPath]), { industry: target.industry, careerPath: target.careerPath });
  }
  return [...destinations.values()].sort((a, b) => a.industry.localeCompare(b.industry) || a.careerPath.localeCompare(b.careerPath));
}

export function certificationLabel(code: string) {
  return ({ A_PLUS: 'CompTIA A+', SECURITY_PLUS: 'CompTIA Security+', AZ_900: 'Microsoft AZ-900', AWS: 'AWS', AZURE: 'Azure' } as Record<string, string>)[code] || code.replaceAll('_', ' ');
}
