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
