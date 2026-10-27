import type {
  ApplicationStage,
  DocumentStatus,
  EducationLevel,
  InterviewLanguage,
  InterviewMode,
  JobStatus,
  Recommendation,
  RequirementCategory,
  ScoringWeights,
  EmploymentType,
} from "@/types/api";

export const STAGE_ORDER: ApplicationStage[] = [
  "applied",
  "screening",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: "Applied",
  screening: "Screening",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Processed",
  failed: "Failed",
};

export const EDUCATION_LEVELS: EducationLevel[] = [
  "none",
  "high_school",
  "diploma",
  "bachelor",
  "master",
  "doctorate",
];

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  none: "No formal requirement",
  high_school: "High school (SMA/SMK)",
  diploma: "Diploma (D3)",
  bachelor: "Bachelor (S1)",
  master: "Master (S2)",
  doctorate: "Doctorate (S3)",
};

export const EMPLOYMENT_TYPES: EmploymentType[] = ["full_time", "part_time", "contract", "internship", "freelance"];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  freelance: "Freelance",
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  advance: "Advance",
  hold: "Hold",
  needs_more_info: "Needs more info",
  not_proceed: "Do not proceed",
};

export const WEIGHT_KEYS: (keyof ScoringWeights)[] = [
  "required_skills",
  "preferred_skills",
  "experience",
  "education",
  "certifications",
  "semantic",
  "screening_questions",
];

export const WEIGHT_LABELS: Record<keyof ScoringWeights, string> = {
  required_skills: "Required skills",
  preferred_skills: "Preferred skills",
  experience: "Experience",
  education: "Education",
  certifications: "Certifications",
  semantic: "Semantic similarity",
  screening_questions: "Screening questions",
};

export const WEIGHT_DESCRIPTIONS: Record<keyof ScoringWeights, string> = {
  required_skills: "Share of required skills found in the CV",
  preferred_skills: "Share of nice-to-have skills found in the CV",
  experience: "Total experience compared with the minimum years",
  education: "Education level and field compared with the requirement",
  certifications: "Required certifications found in the CV",
  semantic: "Overall text similarity between CV and job description",
  screening_questions: "Application-form screening questions answered as expected",
};

export const REQUIREMENT_CATEGORY_LABELS: Record<RequirementCategory, string> = {
  required_skill: "Required skills",
  preferred_skill: "Preferred skills",
  experience: "Experience",
  education: "Education",
  certification: "Certifications",
  screening_question: "Screening questions",
};

export const REQUIREMENT_CATEGORY_ORDER: RequirementCategory[] = [
  "required_skill",
  "preferred_skill",
  "experience",
  "education",
  "certification",
  "screening_question",
];

export const PIPELINE_STEP_LABELS: Record<string, string> = {
  validate: "Validate file",
  extract_text: "Extract text",
  ocr: "OCR",
  preprocess: "Preprocess",
  sections: "Detect sections",
  entities: "Named entities",
  skills: "Skill extraction",
  experience: "Experience",
  education: "Education",
  llm_extraction: "LLM extraction",
  persist: "Persist",
};

export const INTERVIEW_LANGUAGES: InterviewLanguage[] = ["id", "en"];

export const INTERVIEW_LANGUAGE_LABELS: Record<InterviewLanguage, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  conversational: "Conversational",
  template: "Fixed questions",
};

export const INTERVIEW_MODE_DESCRIPTIONS: Record<InterviewMode, string> = {
  conversational: "Conversational interview: a short, human-like conversation led by the AI interviewer",
  template: "Fixed questions: the AI interviewer asks the template questions in order",
};
