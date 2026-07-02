# Pydantic schemas for the ReviewOps agent workflows.
# These mirror the structured shapes used by the TypeScript app (Zod) so the
# REST contract between the Next.js frontend and this service stays stable.

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

QuestionType = Literal[
    "short_text",
    "long_text",
    "single_choice",
    "multi_choice",
    "rating",
    "number",
    "date",
    "email",
    "evidence_link",
    "attachment",
]

PrivacyMode = Literal[
    "named_review_evidence",
    "anonymous_team_pulse",
    "confidential_hr_only",
]


# --- Questionnaire generation -------------------------------------------------

class QuestionnaireInput(BaseModel):
    topic: str
    period: str
    purpose: str | None = None
    role_title: str | None = None
    company_values: list[str] = Field(default_factory=list)
    role_expectations: list[str] = Field(default_factory=list)
    notes: str | None = None
    # Manager's "require evidence" toggle. When False, no question demands a
    # supporting artifact (evidence_required stays False everywhere).
    require_evidence: bool = True


class GeneratedQuestion(BaseModel):
    position: int
    question_type: QuestionType
    text: str
    # Choices for single_choice / multi_choice / rating questions (e.g. an
    # L1..L5 skill scale). Empty for free-text question types.
    options: list[str] = Field(default_factory=list)
    explanation: str = ""
    required: bool = True
    # Whether THIS question expects a supporting link/artifact as evidence.
    # Only set True when the manager asked for evidence (require_evidence).
    evidence_required: bool = False
    # Grouping heading (e.g. "Frameworks & Libraries"); empty string = ungrouped.
    # (Kept non-nullable: Gemini's response_schema rejects nullable/anyOf fields.)
    section: str = ""
    # Marks a section's yes/no opt-in gate: when answered negatively, the other
    # questions in the same section are hidden (progressive disclosure).
    opt_in: bool = False


class ScaleLevel(BaseModel):
    """One level of a shared rating scale (e.g. 'L1 - Awareness' + its full
    description). Listed once in `scale_legend` so the descriptions are not
    repeated inside every question's options."""

    label: str
    description: str = ""


class QuestionnaireOutput(BaseModel):
    title: str
    purpose: str
    privacy_mode: PrivacyMode = "named_review_evidence"
    # Set when the request is DOMINATED by protected/sensitive topics: the agent
    # refuses to generate (empty `questions`) and explains why in refusal_reason.
    refused: bool = False
    refusal_reason: str = ""
    # When questions share a rating scale, the full level descriptions live here
    # ONCE; each question's `options` then carry only the short labels.
    scale_legend: list[ScaleLevel] = Field(default_factory=list)
    # Dynamic length: a short narrative survey is ~5-7, but a structured matrix
    # (one question per skill, plus section gates) can be much longer. NOTE: do
    # NOT set max_length here — a large maxItems makes Gemini's structured-output
    # decoder reject the schema ("too many states for serving"). Length is driven
    # by the prompt instead.
    questions: list[GeneratedQuestion]


# --- Questionnaire PLAN (compact; expanded to QuestionnaireOutput in code) ----

class PlanItem(BaseModel):
    """One line of the compact plan. A matrix cell (`uses_scale=True`) becomes a
    single_choice question over the shared scale; otherwise it becomes a question
    of `type`. Kept tiny so the model emits N items cheaply without repeating
    the scale/options per item (which truncates for large matrices)."""

    text: str
    section: str = ""
    # True → single_choice over the questionnaire's shared scale_legend labels.
    uses_scale: bool = False
    # Used only when uses_scale is False (and it is not an opt-in gate).
    type: QuestionType = "long_text"
    evidence_required: bool = False
    # Section yes/no opt-in gate (expanded to a single_choice Yes/No).
    opt_in: bool = False
    explanation: str = ""


class QuestionnairePlan(BaseModel):
    """Compact generator output. `items` lists each question ONCE (the scale is
    listed once in `scale_legend`); code expands it into QuestionnaireOutput.
    This keeps the model's output small and bounded regardless of item count."""

    title: str
    purpose: str
    privacy_mode: PrivacyMode = "named_review_evidence"
    refused: bool = False
    refusal_reason: str = ""
    scale_legend: list[ScaleLevel] = Field(default_factory=list)
    items: list[PlanItem] = Field(default_factory=list)


# --- Questionnaire safety review ---------------------------------------------

class RiskyQuestion(BaseModel):
    position: int
    reason: str
    safer_alternative: str


class SafetyReport(BaseModel):
    decision: Literal["approved", "needs_revision"]
    risky_questions: list[RiskyQuestion] = Field(default_factory=list)
    notes: str = ""


class QuestionnaireWithSafety(BaseModel):
    """Terminal output of the questionnaire workflow: the generated
    questionnaire plus its safety review."""

    questionnaire: QuestionnaireOutput
    safety: SafetyReport


# --- Evidence validation + mapping -------------------------------------------

EvidenceStatus = Literal["auto_approved", "pending_review"]


class EvidenceInput(BaseModel):
    answer_text: str
    question_text: str = ""
    period: str = ""
    role_expectations: list[str] = Field(default_factory=list)
    company_values: list[str] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)


class EvidenceDimensions(BaseModel):
    specificity: float
    impact: float
    source_support: float
    relevance: float
    time_clarity: float
    review_usability: float


class EvidenceValidation(BaseModel):
    summary: str
    impact: str | None = None
    mapped_value: str | None = None
    quality_score: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    dimensions: EvidenceDimensions
    missing_fields: list[str] = Field(default_factory=list)
    is_weak: bool
    follow_up_question: str | None = None


class EvidenceMapped(BaseModel):
    """Validator output enriched by the values mapper."""

    validation: EvidenceValidation
    company_value: str | None = None
    goal: str | None = None
    role_expectation: str | None = None
    map_confidence: float = Field(ge=0, le=1)


class EvidenceResult(BaseModel):
    """Terminal output of the evidence workflow, including the deterministic
    confidence-gated routing decision."""

    mapped: EvidenceMapped
    status: EvidenceStatus
    routed_reason: str


# --- Review draft + fairness grounding ---------------------------------------

class ReviewEmployee(BaseModel):
    role_title: str
    alias: str = "the employee"  # no real name reaches the model


class ReviewGoal(BaseModel):
    id: str
    title: str


class ReviewEvidence(BaseModel):
    id: str
    summary: str
    impact: str | None = None
    period: str = ""
    company_value: str | None = None
    goal_id: str | None = None
    quality_score: float | None = None


class ReviewContextInput(BaseModel):
    employee: ReviewEmployee
    period: str
    goals: list[ReviewGoal] = Field(default_factory=list)
    role_expectations: list[str] = Field(default_factory=list)
    company_values: list[str] = Field(default_factory=list)
    evidence: list[ReviewEvidence] = Field(default_factory=list)


class ReviewDraftOutput(BaseModel):
    markdown: str
    evidence_references: list[str] = Field(default_factory=list)


FairnessWarningType = Literal[
    "unsupported_claim",
    "vague_praise",
    "vague_criticism",
    "recency_bias",
    "source_imbalance",
    "sensitive_data",
    "compensation_language",
]


class FairnessWarning(BaseModel):
    type: FairnessWarningType
    message: str
    severity: Literal["low", "medium", "high"]


class FairnessReport(BaseModel):
    grounded: bool
    warnings: list[FairnessWarning] = Field(default_factory=list)
    unsupported_claims: int = 0
    cited_evidence: list[str] = Field(default_factory=list)


class ReviewResult(BaseModel):
    """Terminal output of the review workflow: the draft body (no employee name —
    the app adds the heading) plus the deterministic fairness/grounding report."""

    markdown: str
    evidence_references: list[str] = Field(default_factory=list)
    fairness: FairnessReport
