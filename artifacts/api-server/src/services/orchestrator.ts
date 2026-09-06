export type JarvisDomain = "GENERAL" | "WORK" | "FINANCE" | "MARKETS" | "PERSONAL" | "RESEARCH" | "AUTOMATION";

const rules: Array<[JarvisDomain, RegExp]> = [
  ["MARKETS", /\b(stock|market|portfolio|trade|watchlist|crypto|option|robinhood)\b/i],
  ["FINANCE", /\b(budget|bill|paycheck|saving|cash|expense|finance)\b/i],
  ["WORK", /\b(project|task|deadline|client|work|meeting)\b/i],
  ["PERSONAL", /\b(routine|reminder|personal|habit)\b/i],
  ["RESEARCH", /\b(research|compare|investigate|property|company)\b/i],
  ["AUTOMATION", /\b(automation|schedule|trigger|workflow)\b/i],
];

export function routeIntent(content: string): JarvisDomain {
  return rules.find(([, pattern]) => pattern.test(content))?.[0] ?? "GENERAL";
}

export function domainInstruction(domain: JarvisDomain): string {
  const boundaries: Record<JarvisDomain, string> = {
    GENERAL: "Help coordinate the user's request and state what information is missing.",
    WORK: "Focus on concrete projects, tasks, priorities, and deadlines.",
    FINANCE: "Provide organizational help only; never claim to move money or access live accounts.",
    MARKETS: "Treat all market data as unavailable unless supplied. Never submit or imply a trade.",
    PERSONAL: "Focus on routines, reminders, and practical next actions.",
    RESEARCH: "Separate verified facts, assumptions, risks, and sources.",
    AUTOMATION: "Describe bounded, auditable rules. Never create an infinite loop or unsafe action.",
  };
  return boundaries[domain];
}