
export function adjustDifficulty(session) {
  const { accuracy, speed } = session;

  if (accuracy > 0.8 && speed < 10) return "hard";
  if (accuracy < 0.5) return "easy";
  return "medium";
}
