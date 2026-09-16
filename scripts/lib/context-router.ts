import type { ContextCatalog, ContextSkill, ContextTopic, Diagnostic } from "./context-catalog.ts";

export type MatchEvidence = {
  field: "id" | "alias" | "trigger" | "summary" | "kind";
  value: string;
  reason: "exact" | "phrase" | "token";
};

export type QueryCandidate = {
  id: string;
  topic: ContextTopic;
  score: number;
  matched: MatchEvidence[];
};

export type QueryExclusion = { id: string; reason: string };

export type QueryResult = {
  status: "resolved" | "ambiguous" | "no_match" | "invalid_metadata";
  query: string;
  selected: ContextTopic | null;
  candidates: QueryCandidate[];
  matched: MatchEvidence[];
  exclusions: QueryExclusion[];
  score: number | null;
  scoringVersion: 1;
  diagnostics: Diagnostic[];
};

export type SkillCandidate = {
  name: string;
  skill: ContextSkill;
  score: number;
  matched: Array<{ field: "name" | "description"; value: string; reason: "exact" | "phrase" | "token" }>;
};

const STOPWORDS = new Set(
  "a al algo ante antes con contra de del desde e el ella en entre es esta este esto fue ha hay la las lo los me mi para por que se sin sobre su sus un una y ya the a an and are as at be by for from how i in is it me of on or that the this to was what when where with you your do does can please need quiero necesito hacer hacerme como cuál cual que una uno unos unas para por favor sobre dame mostrar abrir buscar".split(" "),
);

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return [...new Set(normalize(value).split(" ").filter((token) => token && !STOPWORDS.has(token)))];
}

function phraseMatch(query: string, phrase: string): boolean {
  const normalizedPhrase = normalize(phrase);
  return !!normalizedPhrase && (` ${query} `).includes(` ${normalizedPhrase} `);
}

function bounded<T>(values: T[], limit = 6): T[] {
  return values.slice(0, limit);
}

function evidenceForTopic(topic: ContextTopic, query: string, queryTokens: string[]): { score: number; matched: MatchEvidence[] } {
  const normalizedId = normalize(topic.id);
  if (query === normalizedId) return { score: 1000, matched: [{ field: "id", value: topic.id, reason: "exact" }] };
  const aliases = topic.aliases ?? [];
  const exactAlias = aliases.find((alias) => normalize(alias) === query);
  if (exactAlias) return { score: 900, matched: [{ field: "alias", value: exactAlias, reason: "exact" }] };
  const triggers = topic.triggers ?? [];
  const exactTrigger = triggers.find((trigger) => normalize(trigger) === query);
  if (exactTrigger) return { score: 800, matched: [{ field: "trigger", value: exactTrigger, reason: "exact" }] };
  let phrase: MatchEvidence | undefined;
  let phraseWords = 0;
  for (const [field, values] of [["alias", aliases], ["trigger", triggers]] as const) {
    for (const value of values) {
      if (!phraseMatch(query, value)) continue;
      const words = normalize(value).split(" ").length;
      if (words > phraseWords) {
        phraseWords = words;
        phrase = { field, value, reason: "phrase" };
      }
    }
  }
  if (phrase) return { score: 700 + Math.min(80, phraseWords * 20), matched: [phrase] };

  const fields: Array<{ field: MatchEvidence["field"]; values: string[]; weight: number }> = [
    { field: "id", values: [topic.id], weight: 13 },
    { field: "alias", values: aliases, weight: 11 },
    { field: "trigger", values: triggers, weight: 10 },
    { field: "summary", values: topic.summary ? [topic.summary] : [], weight: 2 },
    { field: "kind", values: [topic.kind], weight: 1 },
  ];
  const matched: MatchEvidence[] = [];
  let score = 0;
  for (const entry of fields) {
    const fieldTokens = new Set(entry.values.flatMap((value) => tokens(value)));
    const hits = queryTokens.filter((token) => fieldTokens.has(token));
    if (!hits.length) continue;
    score += hits.length * entry.weight;
    const representative = entry.values.find((value) => tokens(value).some((token) => hits.includes(token)));
    if (representative) matched.push({ field: entry.field, value: representative, reason: "token" });
  }
  return { score, matched: bounded(matched) };
}

function exclusionForTopic(topic: ContextTopic, query: string): string | undefined {
  return (topic.excludes ?? []).find((phrase) => phraseMatch(query, phrase));
}

export function queryContext(catalog: ContextCatalog, rawQuery: string): QueryResult {
  const query = normalize(rawQuery);
  const base = {
    query: rawQuery,
    selected: null,
    candidates: [],
    matched: [],
    exclusions: [],
    score: null,
    scoringVersion: 1 as const,
    diagnostics: catalog.diagnostics,
  };
  if (catalog.diagnostics.some((diagnostic) => diagnostic.level === "error")) return { ...base, status: "invalid_metadata" };
  const queryTokens = tokens(query);
  if (!query || !queryTokens.length) return { ...base, status: "no_match" };
  const exclusions: QueryExclusion[] = [];
  const scored: QueryCandidate[] = [];
  for (const topic of catalog.topics) {
    const excluded = exclusionForTopic(topic, query);
    if (excluded) {
      exclusions.push({ id: topic.id, reason: `excluded by phrase: ${excluded}` });
      continue;
    }
    const result = evidenceForTopic(topic, query, queryTokens);
    if (result.score > 0) scored.push({ id: topic.id, topic, score: result.score, matched: result.matched });
  }
  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const lifecycle = (status: ContextTopic["status"]) =>
      status === "active" ? 0 : status === "draft" || status === "reference" ? 1 : 2;
    return lifecycle(left.topic.status) - lifecycle(right.topic.status) || left.id.localeCompare(right.id);
  });
  const candidates = scored.slice(0, 3);
  if (!candidates.length || candidates[0].score < 10) return { ...base, status: "no_match", exclusions };
  const [winner, runnerUp] = candidates;
  const exactWinner = winner.matched.some((match) => match.reason === "exact");
  const tied = !!runnerUp && winner.score === runnerUp.score;
  const lowMargin = !!runnerUp && !exactWinner && winner.score < 800 && winner.score - runnerUp.score <= 10;
  const activeAlternative = scored.find((candidate) => candidate.topic.status === "active");
  const staleWinner =
    !exactWinner &&
    winner.topic.status !== "active" &&
    !!activeAlternative &&
    activeAlternative.score >= winner.score - 100;
  if (tied || lowMargin || staleWinner) return { ...base, status: "ambiguous", candidates, exclusions };
  return { ...base, status: "resolved", selected: winner.topic, candidates, matched: winner.matched, exclusions, score: winner.score };
}

export function rankSkills(catalog: ContextCatalog, rawQuery: string): SkillCandidate[] {
  const query = normalize(rawQuery);
  const queryTokens = tokens(query);
  if (!queryTokens.length) return [];
  const result: SkillCandidate[] = [];
  for (const skill of catalog.skills) {
    const normalizedName = normalize(skill.name);
    const normalizedDescription = normalize(skill.description);
    const matched: SkillCandidate["matched"] = [];
    let score = 0;
    if (query === normalizedName) { score = 1000; matched.push({ field: "name", value: skill.name, reason: "exact" }); }
    else if (phraseMatch(query, normalizedName) || phraseMatch(normalizedName, query)) { score = 700; matched.push({ field: "name", value: skill.name, reason: "phrase" }); }
    else {
      const descriptionHits = queryTokens.filter((token) => normalizedDescription.split(" ").includes(token));
      const nameHits = queryTokens.filter((token) => normalizedName.split(" ").includes(token));
      if (nameHits.length) { score += nameHits.length * 20; matched.push({ field: "name", value: skill.name, reason: "token" }); }
      if (descriptionHits.length) { score += descriptionHits.length * 5; matched.push({ field: "description", value: skill.description, reason: "token" }); }
    }
    if (score) result.push({ name: skill.name, skill, score, matched: bounded(matched, 3) });
  }
  return result.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name)).slice(0, 3);
}

export { normalize as normalizeContextQuery };
