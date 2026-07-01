export type ScaleLevel = { label: string; description: string };

/**
 * Renders a shared rating scale ONCE (collapsible), so per-question options can
 * stay as short labels instead of repeating the full level descriptions.
 * Plain (hook-free) component — usable from both server and client components.
 */
export default function ScaleLegend({ legend }: { legend: ScaleLevel[] }) {
  if (!legend || legend.length === 0) return null;
  return (
    <details className="card" open>
      <summary style={{ cursor: "pointer" }}>
        <strong>Rating scale</strong>{" "}
        <span className="muted small">({legend.length} levels)</span>
      </summary>
      <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {legend.map((l) => (
          <li key={l.label} style={{ marginBottom: 4 }}>
            <strong>{l.label}</strong>
            {l.description ? ` — ${l.description}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}
