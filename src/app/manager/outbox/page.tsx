import Link from "next/link";
import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getOutboxForManager } from "@/server/services/outboxService";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const messages = getOutboxForManager(user.id);

  return (
    <Layout user={user}>
      <h1 style={{ fontSize: 22 }}>Mock outbox</h1>
      <div className="card">
        <p className="muted small">
          Stand-in for Slack/email delivery (roadmap item). Each personal link is
          bound to one assignment; only the token hash is stored on the server.
        </p>
        {messages.length === 0 ? (
          <p className="muted small">
            No messages yet. Approve a questionnaire to generate personal links.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>To</th>
                <th>Questionnaire</th>
                <th>Personal link</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td>{m.respondentName}</td>
                  <td className="muted">{m.questionnaireTitle}</td>
                  <td>
                    <Link className="linkbox" href={m.link}>
                      {m.link}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
