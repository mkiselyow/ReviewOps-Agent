import Layout from "@/components/Layout";
import SurveyResponseForm from "@/components/SurveyResponseForm";
import ScaleLegend from "@/components/ScaleLegend";
import {
  getAssignmentByToken,
  getQuestionnaire,
  getQuestions,
  getResponsesForAssignment,
  markAssignmentOpened,
} from "@/server/services/surveyService";
import { isAssignmentExpired } from "@/server/auth/permissions";

export const dynamic = "force-dynamic";

const PRIVACY_NOTE: Record<string, string> = {
  named_review_evidence:
    "This is a named survey. Your responses are linked to you and may be used for review preparation only if you allow it below.",
  anonymous_team_pulse:
    "This is an anonymous team pulse. Responses are aggregated and not attributed to you.",
  confidential_hr_only:
    "This survey is confidential to HR. Your manager will not see individual responses.",
};

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const assignment = await getAssignmentByToken(token);

  if (!assignment || isAssignmentExpired(assignment)) {
    return (
      <Layout user={null}>
        <div className="card">
          <h2>Survey link unavailable</h2>
          <p className="muted">
            This personal survey link is invalid, expired, or has been revoked.
          </p>
        </div>
      </Layout>
    );
  }

  await markAssignmentOpened(assignment.id);

  const questionnaire = await getQuestionnaire(assignment.questionnaireId);
  const questions = await getQuestions(assignment.questionnaireId);
  const existing = await getResponsesForAssignment(assignment.id);
  const initialAnswers: Record<string, string> = {};
  for (const r of existing) initialAnswers[r.questionId] = r.answerText ?? "";

  const privacyNote =
    PRIVACY_NOTE[questionnaire?.privacyMode ?? "named_review_evidence"];

  return (
    <Layout user={null}>
      <div className="card">
        <h1 style={{ fontSize: 22, margin: "0 0 6px" }}>
          {questionnaire?.title ?? "Survey"}
        </h1>
        {questionnaire?.purpose && <p className="muted">{questionnaire.purpose}</p>}
        {questionnaire?.deadline && (
          <p className="small muted">📅 Please respond by <strong>{questionnaire.deadline}</strong>.</p>
        )}
        <div className="note">{privacyNote}</div>
      </div>

      <ScaleLegend
        legend={
          questionnaire?.scaleLegendJson
            ? (JSON.parse(questionnaire.scaleLegendJson) as {
                label: string;
                description: string;
              }[])
            : []
        }
      />

      <SurveyResponseForm
        token={token}
        questions={questions.map((q) => ({
          id: q.id,
          position: q.position,
          questionType: q.questionType,
          text: q.text,
          options: q.optionsJson ? (JSON.parse(q.optionsJson) as string[]) : [],
          required: q.required,
          evidenceRequired: q.evidenceRequired,
          section: q.section,
          optIn: q.optIn,
          explanation: q.explanation,
        }))}
        initialAnswers={initialAnswers}
      />
    </Layout>
  );
}
