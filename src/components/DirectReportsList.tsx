import Link from "next/link";

type Report = { id: string; displayName: string; roleTitle: string };

export default function DirectReportsList({ reports }: { reports: Report[] }) {
  if (reports.length === 0) {
    return <p className="muted small">No direct reports.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr key={r.id}>
            <td>{r.displayName}</td>
            <td className="muted">{r.roleTitle}</td>
            <td style={{ textAlign: "right" }}>
              <Link className="btn btn-ghost" href={`/manager/reviews/new/${r.id}`}>
                Generate review
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
