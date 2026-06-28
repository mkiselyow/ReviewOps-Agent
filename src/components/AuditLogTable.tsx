type AuditRow = {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
};

const DENY = "access_denied";

export default function AuditLogTable({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return <p className="muted small">No audit events yet.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Resource</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="small muted">{new Date(r.createdAt).toLocaleString()}</td>
            <td>{r.actorName}</td>
            <td>
              <span className={`badge ${r.action === DENY ? "bad" : ""}`}>
                {r.action.replace(/_/g, " ")}
              </span>
            </td>
            <td className="small muted">
              {r.resourceType ?? "—"}
              {r.resourceId ? ` · ${r.resourceId.slice(0, 12)}` : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
