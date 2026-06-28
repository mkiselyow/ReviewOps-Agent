import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import QuestionnaireForm from "@/components/QuestionnaireForm";
import { getCurrentUser } from "@/server/auth/mockSession";
import { currentPeriod } from "@/server/utils/dates";

export const dynamic = "force-dynamic";

export default async function NewQuestionnairePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <Layout user={user}>
      <h1 style={{ fontSize: 22 }}>New questionnaire</h1>
      <QuestionnaireForm defaultPeriod={currentPeriod()} />
    </Layout>
  );
}
