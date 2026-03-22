
# Hint System + Session Pool Update
- Hint 1 removes two incorrect answers for MCQ/incident questions (-5 XP)
- Hint 2 reveals a partial explanation (-10 XP)
- Hint 3 reveals the current domain hint (-15 XP)
- Hint usage is tracked per session in `GameSession`
- Leaderboard score is reduced when hints are used
- Default session size is now 20 questions
- Question selection avoids previously seen questions until the user exhausts the pool, then resets automatically
