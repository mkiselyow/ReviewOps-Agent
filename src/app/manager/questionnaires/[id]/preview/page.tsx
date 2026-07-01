import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import QuestionnairePreview from "@/components/QuestionnairePreview";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getQuestionnaire, getQuestions } from "@/server/services/surveyService";

export const dynamic = "force-dynamic";

type SafetyReport = {
  decision: "approved" | "needs_revision";
  riskyQuestions: { position: number; reason: string; saferAlternative: string }[];
  notes: string;
};

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const questionnaire = await getQuestionnaire(id);
  if (!questionnaire || questionnaire.createdByManagerId !== user.id) {
    return (
      <Layout user={user}>
        <div className="note bad">Questionnaire not found or not accessible.</div>
      </Layout>
    );
  }

  const questions = await getQuestions(id);
  // Safety review was captured at generation time.
  const safety: SafetyReport = questionnaire.safetyJson
    ? JSON.parse(questionnaire.safetyJson)
    : { decision: "approved", riskyQuestions: [], notes: "" };

  return (
    <Layout user={user}>
      <QuestionnairePreview
        questionnaireId={id}
        title={questionnaire.title}
        purpose={questionnaire.purpose}
        status={questionnaire.status}
        scaleLegend={
          questionnaire.scaleLegendJson
            ? (JSON.parse(questionnaire.scaleLegendJson) as {
                label: string;
                description: string;
              }[])
            : []
        }
        questions={questions.map((q) => ({
          id: q.id,
          position: q.position,
          questionType: q.questionType,
          text: q.text,
          options: q.optionsJson ? (JSON.parse(q.optionsJson) as string[]) : [],
          section: q.section,
          evidenceRequired: q.evidenceRequired,
          explanation: q.explanation,
        }))}
        safety={safety}
      />
    </Layout>
  );
}
