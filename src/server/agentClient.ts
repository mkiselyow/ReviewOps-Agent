/**
 * Client for the Python ADK 2.0 agent service.
 *
 * When `AGENT_SERVICE_URL` is set, the orchestrator calls these methods instead
 * of the in-process TS agents. Responses (snake_case) are mapped to the
 * camelCase shapes the rest of the app uses.
 *
 * The TS agents in `src/server/agents/*` remain the no-URL fallback (used by
 * unit tests) until they are removed in favor of mocking this client.
 */

export function usingAgentService(): boolean {
  return Boolean(process.env.AGENT_SERVICE_URL);
}

function baseUrl(): string {
  return process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8800";
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`agent-service ${path} ${res.status}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// --- Questionnaire ----------------------------------------------------------

export type ClientGeneratedQuestion = {
  position: number;
  questionType: string;
  text: string;
  options: string[];
  explanation: string;
  required: boolean;
  evidenceRequired: boolean;
  section: string | null;
  optIn: boolean;
};
export type ScaleLevel = { label: string; description: string };
export type ClientQuestionnaire = {
  title: string;
  purpose: string;
  privacyMode: string;
  refused: boolean;
  refusalReason: string;
  scaleLegend: ScaleLevel[];
  questions: ClientGeneratedQuestion[];
  safety: {
    decision: "approved" | "needs_revision";
    riskyQuestions: { position: number; reason: string; saferAlternative: string }[];
    notes: string;
  };
};

export async function generateQuestionnaire(input: {
  topic: string;
  period: string;
  purpose?: string;
  roleTitle?: string;
  companyValues: string[];
  roleExpectations: string[];
  notes?: string;
  requireEvidence?: boolean;
}): Promise<ClientQuestionnaire> {
  const r = await post<{
    questionnaire: {
      title: string;
      purpose: string;
      privacy_mode: string;
      refused?: boolean;
      refusal_reason?: string;
      scale_legend?: { label: string; description: string }[];
      questions: {
        position: number;
        question_type: string;
        text: string;
        options?: string[];
        explanation: string;
        required: boolean;
        evidence_required?: boolean;
        section?: string | null;
        opt_in?: boolean;
      }[];
    };
    safety: {
      decision: "approved" | "needs_revision";
      risky_questions: { position: number; reason: string; safer_alternative: string }[];
      notes: string;
    };
  }>("/questionnaire", {
    topic: input.topic,
    period: input.period,
    purpose: input.purpose,
    role_title: input.roleTitle,
    company_values: input.companyValues,
    role_expectations: input.roleExpectations,
    notes: input.notes,
    require_evidence: input.requireEvidence ?? true,
  });
  return {
    title: r.questionnaire.title,
    purpose: r.questionnaire.purpose,
    privacyMode: r.questionnaire.privacy_mode,
    refused: r.questionnaire.refused ?? false,
    refusalReason: r.questionnaire.refusal_reason ?? "",
    scaleLegend: (r.questionnaire.scale_legend ?? []).map((s) => ({
      label: s.label,
      description: s.description,
    })),
    questions: r.questionnaire.questions.map((q) => ({
      position: q.position,
      questionType: q.question_type,
      text: q.text,
      options: q.options ?? [],
      explanation: q.explanation,
      required: q.required,
      evidenceRequired: q.evidence_required ?? false,
      section: q.section ? q.section : null,
      optIn: q.opt_in ?? false,
    })),
    safety: {
      decision: r.safety.decision,
      riskyQuestions: (r.safety.risky_questions ?? []).map((x) => ({
        position: x.position,
        reason: x.reason,
        saferAlternative: x.safer_alternative,
      })),
      notes: r.safety.notes,
    },
  };
}

// --- Evidence ---------------------------------------------------------------

export type ClientEvidenceValidation = {
  summary: string;
  impact: string | null;
  mappedValue: string | null;
  qualityScore: number;
  confidence: number;
  isWeak: boolean;
  followUpQuestion: string | null;
  missingFields: string[];
  companyValue: string | null;
  goal: string | null;
  status: "auto_approved" | "pending_review";
  routedReason: string;
};

export async function validateEvidence(input: {
  answerText: string;
  questionText: string;
  period: string;
  roleExpectations: string[];
  companyValues: string[];
  goals: string[];
}): Promise<ClientEvidenceValidation> {
  const r = await post<{
    mapped: {
      validation: {
        summary: string;
        impact: string | null;
        mapped_value: string | null;
        quality_score: number;
        confidence: number;
        is_weak: boolean;
        follow_up_question: string | null;
        missing_fields: string[];
      };
      company_value: string | null;
      goal: string | null;
    };
    status: "auto_approved" | "pending_review";
    routed_reason: string;
  }>("/evidence", {
    answer_text: input.answerText,
    question_text: input.questionText,
    period: input.period,
    role_expectations: input.roleExpectations,
    company_values: input.companyValues,
    goals: input.goals,
  });
  const v = r.mapped.validation;
  return {
    summary: v.summary,
    impact: v.impact,
    mappedValue: v.mapped_value,
    qualityScore: v.quality_score,
    confidence: v.confidence,
    isWeak: v.is_weak,
    followUpQuestion: v.follow_up_question,
    missingFields: v.missing_fields ?? [],
    companyValue: r.mapped.company_value,
    goal: r.mapped.goal,
    status: r.status,
    routedReason: r.routed_reason,
  };
}

// --- Review -----------------------------------------------------------------

export type ClientReviewContext = {
  employee: { role_title: string; alias: string };
  period: string;
  goals: { id: string; title: string }[];
  role_expectations: string[];
  company_values: string[];
  evidence: {
    id: string;
    summary: string;
    impact: string | null;
    period: string;
    company_value: string | null;
    goal_id: string | null;
    quality_score: number | null;
  }[];
};

export type ClientReviewResult = {
  markdown: string;
  evidenceReferences: string[];
  fairness: {
    grounded: boolean;
    warnings: { type: string; message: string; severity: "low" | "medium" | "high" }[];
    unsupportedClaims: number;
    citedEvidence: string[];
  };
};

export async function generateReview(
  context: ClientReviewContext,
): Promise<ClientReviewResult> {
  const r = await post<{
    markdown: string;
    evidence_references: string[];
    fairness: {
      grounded: boolean;
      warnings: { type: string; message: string; severity: "low" | "medium" | "high" }[];
      unsupported_claims: number;
      cited_evidence: string[];
    };
  }>("/review", context);
  return {
    markdown: r.markdown,
    evidenceReferences: r.evidence_references ?? [],
    fairness: {
      grounded: r.fairness.grounded,
      warnings: r.fairness.warnings ?? [],
      unsupportedClaims: r.fairness.unsupported_claims,
      citedEvidence: r.fairness.cited_evidence ?? [],
    },
  };
}
