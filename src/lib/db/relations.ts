/**
 * Every relation field in prisma/schema.prisma: the model it points to and
 * whether it is a list. The owner-scoped client walks `include`, `select`,
 * `where`, `orderBy` and nested writes with it, so a relation from any model
 * into an owned one is scoped or refused (scoped.ts). Kept in step with the
 * schema by `src/test/tenancy/relations.test.ts`: change the schema, then
 * update this map until that test passes.
 */
export type Relation = { model: string; list: boolean };

export const RELATIONS: Readonly<Record<string, Readonly<Record<string, Relation>>>> = {
  User: {
    sessions: { model: "Session", list: true },
    accounts: { model: "Account", list: true },
    applications: { model: "Application", list: true },
    statusEvents: { model: "StatusEvent", list: true },
    documents: { model: "Document", list: true },
    documentVersions: { model: "DocumentVersion", list: true },
    chatMessages: { model: "ChatMessage", list: true },
    notes: { model: "Note", list: true },
    jobs: { model: "Job", list: true },
  },
  Session: {
    user: { model: "User", list: false },
  },
  Account: {
    user: { model: "User", list: false },
  },
  Skill: {
    experiences: { model: "ExperienceSkill", list: true },
    projects: { model: "ProjectSkill", list: true },
  },
  Experience: {
    skills: { model: "ExperienceSkill", list: true },
  },
  ExperienceSkill: {
    experience: { model: "Experience", list: false },
    skill: { model: "Skill", list: false },
  },
  Project: {
    skills: { model: "ProjectSkill", list: true },
  },
  ProjectSkill: {
    project: { model: "Project", list: false },
    skill: { model: "Skill", list: false },
  },
  Fact: {
    application: { model: "Application", list: false },
  },
  Theme: {
    documents: { model: "Document", list: true },
  },
  Application: {
    posting: { model: "Posting", list: false },
    agentCandidate: { model: "AgentCandidate", list: false },
    startup: { model: "Startup", list: false },
    emails: { model: "EmailMessage", list: true },
    events: { model: "StatusEvent", list: true },
    documents: { model: "Document", list: true },
    messages: { model: "ChatMessage", list: true },
    notes: { model: "Note", list: true },
    facts: { model: "Fact", list: true },
    jobs: { model: "Job", list: true },
    user: { model: "User", list: false },
  },
  StatusEvent: {
    application: { model: "Application", list: false },
    user: { model: "User", list: false },
  },
  Document: {
    application: { model: "Application", list: false },
    theme: { model: "Theme", list: false },
    versions: { model: "DocumentVersion", list: true },
    user: { model: "User", list: false },
  },
  DocumentVersion: {
    document: { model: "Document", list: false },
    user: { model: "User", list: false },
  },
  ChatMessage: {
    application: { model: "Application", list: false },
    user: { model: "User", list: false },
  },
  Note: {
    application: { model: "Application", list: false },
    user: { model: "User", list: false },
  },
  Posting: {
    application: { model: "Application", list: false },
  },
  AgentCandidate: {
    application: { model: "Application", list: false },
  },
  Startup: {
    application: { model: "Application", list: false },
  },
  EmailMessage: {
    application: { model: "Application", list: false },
  },
  Job: {
    application: { model: "Application", list: false },
    user: { model: "User", list: false },
  },
};
