import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import QuestionnairePreview from "@/components/QuestionnairePreview";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getQuestionnaire, getQuestions } from "@/server/services/surveyService";
import { runQuestionnaireSafetyAgent } from "@/server/agents/questionnaireSafetyAgent";

export const dynamic = "force-dynamic";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const questionnaire = getQuestionnaire(id);
  if (!questionnaire || questionnaire.createdByManagerId !== user.id) {
    return (
      <Layout user={user}>
        <div className="note bad">Questionnaire not found or not accessible.</div>
      </Layout>
    );
  }

  const questions = getQuestions(id);
  const safety = await runQuestionnaireSafetyAgent({
    questions: questions.map((q) => ({ position: q.position, text: q.text })),
  });

  return (
    <Layout user={user}>
      <QuestionnairePreview
        questionnaireId={id}
        title={questionnaire.title}
        purpose={questionnaire.purpose}
        status={questionnaire.status}
        questions={questions.map((q) => ({
          id: q.id,
          position: q.position,
          questionType: q.questionType,
          text: q.text,
          explanation: q.explanation,
        }))}
        safety={safety.output}
      />
    </Layout>
  );
}
