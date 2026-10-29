import { z } from "zod";

import { matchSchema, type Extracted, type Match } from "@/lib/application-data";
import { experienceMonths, formatMonthYear, languageLevelLabel, sameName, type EducationItem, type ProfileData } from "@/lib/profile";

import { system, UNTRUSTED_POSTING, type Task } from "./prompt-parts";

export const MATCH_REQUIREMENTS_VERSION = "match-requirements@1";

// The model only says which profile skill or language each requirement is
// about; code decides covered, partial or gap from the profile itself, so the
// match is deterministic and explainable (NEW-4, E7-4).
const answerSchema = z.object({
  matches: z.array(
    z.object({
      /** The requirement's number in the list. */
      requirement: z.number().int(),
      /** A skill from the profile's list, spelled as there, or null. */
      skill: z.string().nullable(),
      /** A language from the profile's list, or null. */
      language: z.string().nullable(),
    }),
  ),
});

const INSTRUCTIONS = `You compare a job's requirements with a candidate's skills and languages.

For each numbered requirement, answer which ONE of the candidate's skills it is about, if any, and which of the candidate's languages, if any. Copy names exactly as they appear in the candidate's lists. Match on meaning ("Strong prototyping skills in Figma" is about "Figma"; "Has built or maintained a design system" is about "Design systems"), but don't stretch: when no skill really fits, answer null. Answer every requirement once.`;

export type MatchInput = { requirements: Extracted["requirements"]; profile: ProfileData; today?: Date };

/** NEW-4: each requirement covered, partial or a gap, with its evidence. */
export const matchRequirements: Task<MatchInput, Match> = async (provider, { requirements, profile, today = new Date() }, { signal }) => {
  const needsModel = requirements.some((requirement) => requirement.kind !== "years");
  const answer = needsModel
    ? await provider.complete({
        system: system(INSTRUCTIONS, UNTRUSTED_POSTING),
        messages: [
          {
            role: "user",
            content: JSON.stringify(
              {
                requirements: requirements.map((requirement, index) => ({ number: index, text: requirement.text, kind: requirement.kind, skill: requirement.skill })),
                candidateSkills: profile.skills.map((skill) => skill.name),
                candidateLanguages: profile.languages.map((language) => language.name),
              },
              null,
              2,
            ),
          },
        ],
        schema: answerSchema,
        schemaName: "requirement_matches",
        creativity: "FAITHFUL",
        effort: "low",
        signal,
      })
    : { matches: [] };

  const mapped = new Map(answer.matches.map((match) => [match.requirement, match]));
  return {
    data: matchSchema.parse({
      items: requirements.map((requirement, index) => classify(requirement, mapped.get(index), profile, today)),
    }),
    promptVersion: MATCH_REQUIREMENTS_VERSION,
  };
};

type Item = Match["items"][number];

function classify(
  requirement: Extracted["requirements"][number],
  mapped: { skill: string | null; language: string | null } | undefined,
  profile: ProfileData,
  today: Date,
): Item {
  const base = { requirement: requirement.text, skill: null, experienceIds: [] as string[], note: null };

  if (requirement.kind === "years") {
    const dated = profile.experience.filter((entry) => entry.startYear !== null);
    if (dated.length === 0) return { ...base, result: "gap", note: "Add your experience to check this" };
    const first = dated.reduce((earliest, entry) =>
      entry.startYear! * 12 + (entry.startMonth ?? 1) < earliest.startYear! * 12 + (earliest.startMonth ?? 1) ? entry : earliest,
    );
    const count = profile.experience.length;
    const roles = `${count} ${count === 1 ? "role" : "roles"} in your profile, since ${formatMonthYear(first.startYear, first.startMonth)}`;
    const years = Math.floor(experienceMonths(profile, today) / 12);
    return years >= (requirement.years ?? 0)
      ? { ...base, result: "covered", note: roles }
      : { ...base, result: "gap", note: `${roles} (about ${years} ${years === 1 ? "year" : "years"})` };
  }

  // Names must be the profile's own: a model can't add a skill by misspelling one.
  const language = profile.languages.find(
    (entry) => (mapped?.language && sameName(entry.name, mapped.language)) || (requirement.language && sameName(entry.name, requirement.language)),
  );
  if (requirement.kind === "language" || (language && !mapped?.skill)) {
    return language
      ? { ...base, result: "covered", skill: language.name, note: `${language.name}: ${languageLevelLabel(language.level)}` }
      : { ...base, result: "gap", note: "Not in your profile" };
  }

  // The model's pick first, then the skill the posting names; spelling may differ a little.
  const skill =
    profile.skills.find((entry) => mapped?.skill && sameSkill(entry.name, mapped.skill)) ??
    profile.skills.find((entry) => requirement.skill && sameSkill(entry.name, requirement.skill));
  // A degree is checked against Education, in code, never by the model.
  const degree = !skill && requirement.kind === "other" ? matchDegree(requirement.text, profile.education) : null;
  if (degree) return { ...base, ...degree };
  if (!skill) {
    return {
      ...base,
      result: "gap",
      note: requirement.kind === "skill" ? "Not in your profile yet" : "Nothing in your profile, so I'll address it honestly in the letter",
    };
  }
  const roles = profile.experience.filter((entry) => entry.skillIds.includes(skill.id));
  return roles.length > 0
    ? {
        ...base,
        result: "covered",
        skill: skill.name,
        experienceIds: roles.map((entry) => entry.id),
        note: `Used at ${[...new Set(roles.map((entry) => entry.company || entry.role))].join(", ")}`,
      }
    : { ...base, result: "partial", skill: skill.name, note: "In your skills, but not linked to a role yet" };
}

/**
 * Whether two skill names mean the same skill, forgiving case, punctuation
 * and a plural: "Design system" is "Design systems", "UX-research" is "UX research".
 */
export function sameSkill(a: string, b: string): boolean {
  const key = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(" ")
      .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
      .join(" ");
  return key(a) === key(b);
}

// ─── Degrees ────────────────────────────────────────────────────────────────
// A posting's "Bachelor's degree in Computer Science" used to fall through to
// "Nothing in your profile", and the letter then told the employer the
// candidate had no degree. Degrees are checked here against Education.

/** 0 = not a degree (a diploma, a course), 1 = bachelor's, 2 = master's, 3 = doctorate. */
type DegreeLevel = 0 | 1 | 2 | 3;

// Words match in any case; abbreviations only in capitals, so "be able to",
// "it" and "MS Office" aren't read as degrees or fields. Text written all in
// capitals ("MUST BE ABLE TO TRAVEL") gets no abbreviation matching at all.
const either = (words: RegExp, abbreviations: RegExp) => ({
  test: (text: string) => words.test(text) || (/[a-z]/.test(text) && abbreviations.test(text)),
});
const DOCTORATE = either(/\b(doctorate|doctoral)\b/i, /\bPh\.?\s?D\b/);
const MASTERS = either(/\b(master['’]?s|master of|master degree|post[- ]?graduate)\b/i, /\b(M\.?\s?Tech|M\.?\s?Sc|M\.\s?S\.?|M\.\s?E\.?|MBA|MCA|M\.\s?A\.?)(?![\w.])/);
const BACHELORS = either(/\b(bachelor'?s?|undergraduate)\b/i, /\b(B\.?\s?Tech|B\.?\s?Sc|B\.\s?E\.?|B\.\s?S\.?|B\.\s?A\.?|BCA|BE|BS)(?![\w.])/);
/** "360-degree" and "a high degree of" aren't degrees. */
const ANY_DEGREE = /(?<![\d-])\b(degree|graduate|graduation)\b(?!\s+of\b)/i;
/** Engineering degrees name their field in the abbreviation. */
const ENGINEERING_DEGREE = either(/\b(bachelor|master) of (technology|engineering)\b/i, /\b(B\.?\s?Tech|B\.\s?E\.?|BE|M\.?\s?Tech|M\.\s?E\.?)(?![\w.])/);

/** Fields a posting may ask for, each with the words that show it in a degree or its notes. */
const FIELDS: Record<string, { test: (text: string) => boolean }> = {
  engineering: either(/\bengineering\b/i, /$^/),
  "computer science": either(/\b(computer science|computer applications|computing)\b/i, /\b(CS|CSE)\b/),
  "information technology": either(/\binformation technology\b/i, /\bIT\b/),
  mathematics: either(/\b(mathematics|maths)\b/i, /$^/),
  statistics: either(/\bstatistics\b/i, /$^/),
  physics: either(/\bphysics\b/i, /$^/),
};

/** In Education, short forms that in a posting usually mean something else ("BA" is often Business Analyst). */
const EDUCATION_MASTERS = /^\s*(MA|MS|MEng|M\.?\s?Com)\b/;
const EDUCATION_BACHELORS = /^\s*(BA|BEng|BBA|BBM|B\.?\s?Com|B\.?\s?Arch|LLB)\b/;
/** "PhD-level rigor" describes a standard, not a degree asked for. */
const LEVEL_PHRASE = /\b(Ph\.?\s?D\.?|doctoral|doctorate|master['’]?s|graduate)[- ]level\b/gi;
/** The posting accepts experience in place of the degree. */
const OR_EXPERIENCE = /\bequivalent\b[^.;]*\bexperience\b|\bexperience\b[^.;]*\bin lieu\b/i;

function degreeLevel(text: string): DegreeLevel {
  if (DOCTORATE.test(text)) return 3;
  if (MASTERS.test(text) || EDUCATION_MASTERS.test(text)) return 2;
  if (BACHELORS.test(text) || EDUCATION_BACHELORS.test(text)) return 1;
  return 0;
}

/** The lowest degree that meets the requirement, or null when it isn't about a degree. */
function requiredLevel(requirement: string): DegreeLevel | null {
  const text = requirement.replace(LEVEL_PHRASE, " ");
  // "Bachelor's or Master's" is met by a bachelor's, so the lowest level named wins.
  if (BACHELORS.test(text)) return 1;
  if (MASTERS.test(text)) return 2;
  if (DOCTORATE.test(text)) return 3;
  return ANY_DEGREE.test(text) ? 1 : null;
}

/** Whether an education entry is in one of the fields the posting names. */
function inField(entry: EducationItem, fields: string[]): boolean {
  const text = `${entry.degree} ${entry.notes}`;
  return fields.some((field) => FIELDS[field].test(text) || (field === "engineering" && ENGINEERING_DEGREE.test(entry.degree)));
}

/**
 * A degree requirement checked against Education (covered, partial or gap
 * with the entry as evidence), or null when the requirement isn't about a
 * degree. "Or related field" counts any degree at the level asked as partial
 * when the field isn't shown.
 */
export function matchDegree(
  requirement: string,
  education: readonly EducationItem[],
): Pick<Match["items"][number], "result" | "note"> | null {
  const needed = requiredLevel(requirement);
  if (needed === null) return null;

  const degrees = education.filter((entry) => entry.degree.trim()).map((entry) => ({ entry, level: degreeLevel(entry.degree) }));
  const best = degrees.reduce<(typeof degrees)[number] | null>((top, item) => (!top || item.level > top.level ? item : top), null);
  const describe = (entry: EducationItem) => [entry.degree.trim(), entry.school.trim()].filter(Boolean).join(", ");

  if (!best || best.level < needed) {
    const note = best ? `Your highest listed is ${describe(best.entry)}, below what this asks` : "No degree in your Education yet";
    return { result: "gap", note: OR_EXPERIENCE.test(requirement) ? `${note}; it accepts equivalent experience instead` : note };
  }

  const fields = Object.keys(FIELDS).filter((field) => FIELDS[field].test(requirement));
  const atLevel = degrees.filter((item) => item.level >= needed);
  if (fields.length === 0) return { result: "covered", note: describe(atLevel[0].entry) };

  const matching = atLevel.find((item) => inField(item.entry, fields));
  if (matching) return { result: "covered", note: describe(matching.entry) };
  return { result: "partial", note: `${describe(atLevel[0].entry)}; your profile doesn't show it is in ${fields.join(" or ")}` };
}
