import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import ReviewGenerateForm from "@/components/ReviewGenerateForm";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getUserById } from "@/server/services/hrisService";
import { canManagerViewEmployee } from "@/server/auth/permissions";
import { currentPeriod } from "@/server/utils/dates";

export const dynamic = "force-dynamic";

export default async function NewReviewPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { employeeId } = await params;

  const employee = getUserById(employeeId);
  if (!employee || !canManagerViewEmployee(user.id, employee)) {
    return (
      <Layout user={user}>
        <div className="note bad">
          You can only generate reviews for your direct reports.
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user}>
      <ReviewGenerateForm
        employeeId={employee.id}
        employeeName={employee.displayName}
        defaultPeriod={currentPeriod()}
      />
    </Layout>
  );
}
