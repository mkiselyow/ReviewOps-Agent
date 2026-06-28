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


class GeneratedQuestion(BaseModel):
    position: int
    question_type: QuestionType
    text: str
    explanation: str = ""
    required: bool = True


class QuestionnaireOutput(BaseModel):
    title: str
    purpose: str
    privacy_mode: PrivacyMode = "named_review_evidence"
    questions: list[GeneratedQuestion] = Field(min_length=5, max_length=7)


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
