import Link from "next/link";
import { redirect } from "next/navigation";
import Layout from "@/components/Layout";
import { getCurrentUser } from "@/server/auth/mockSession";
import { getOutboxForManager } from "@/server/services/outboxService";

export const dynamic = "force-dynamic";

/** ISO timestamp → "2026-07-03 14:30 UTC" (server renders in UTC). */
function formatSent(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export default async function OutboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Already newest-first (getOutboxForManager orders by createdAt desc).
  const messages = await getOutboxForManager(user.id);

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
                <th>Sent</th>
                <th>To</th>
                <th>Questionnaire</th>
                <th>Type</th>
                <th>Personal link</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>
                    {formatSent(m.createdAt)}
                  </td>
                  <td>{m.respondentName}</td>
                  <td className="muted">{m.questionnaireTitle}</td>
                  <td>
                    <span className={`badge ${m.channel === "reminder" ? "warn" : ""}`}>
                      {m.channel === "reminder" ? "reminder" : "link"}
                    </span>
                  </td>
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
