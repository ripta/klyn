export const FORTUNES = [
  "It compiles. Ship it!",
  "The vibes are immaculate.",
  "The Agent concurs.",
  "Green tests, green light.",
  "May the context window favor you today.",
  "Merge with confidence.",
  "Yes, and the linter agrees.",
  "The agent has spoken: proceed.",
  "Tokens aligned. Outlook excellent.",
  "Prompt accepted by the universe.",

  "Ask again after `pnpm install`.",
  "Reply hazy, try a smaller temperature.",
  "Context insufficient — paste more code.",
  "The agent is still thinking… (19,747 tool calls remaining).",
  "RAG returned nothing relevant.",
  "Concentrate and reprompt.",
  "Have you tried turning the IDE off and on again?",
  "Reasoning model required for this question.",
  "Better ask Claude Copilot, Jr.",
  "Outlook unclear, embeddings drifting.",

  "Hallucination detected. Do not trust.",
  "My sources say no (and they're fabricated).",
  "Rate limit reached on destiny.",
  "That's a `/skill` issue.",
  "The vibes are off. Refactor immediately.",
  "`git blame` points to you.",
  "Production is down. Now is not the time.",
  "Stack Overflow has closed your question as duplicate.",
  "The agent rm -rf'd its way into your hopes and dreams.",
  "Token budget exceeded. Try again next year.",

  "Trust the vibes, not the types.",
  "The function works. Nobody knows why.",
  "You don't write the code, the code writes you.",
  "Commit now, understand later.",
  "// TODO: figure out what this does",
  "That's future you's problem.",
  "Don't read the code.",
  "If it feels right, force-push to main.",
  "Tests are a construct. Belief is the only assertion.",
  "The vibe is dead, long live the vibe.",
  "You are the prompt. The prompt is you.",
]

let lastIndex = -1
export function pickFortune() {
  if (FORTUNES.length < 2) return FORTUNES[0]
  let i
  do { i = Math.floor(Math.random() * FORTUNES.length) } while (i === lastIndex)
  lastIndex = i
  return FORTUNES[i]
}
