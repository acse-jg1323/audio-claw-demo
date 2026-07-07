import {
  buildGlossaryPromptTerms,
  findMatchingTermRules,
} from "../storage/terms-store.js?v=20260624-terms";

export function matchGlossaryForSegment({
  actor,
  text,
  sourceLanguage,
  targetLanguage,
}) {
  const matches = findMatchingTermRules({
    actor,
    text,
    sourceLanguage,
    targetLanguage,
  });
  const glossaryTerms = buildGlossaryPromptTerms(matches);

  return {
    matches,
    glossaryTerms,
    hasGlossary: glossaryTerms.length > 0,
  };
}
