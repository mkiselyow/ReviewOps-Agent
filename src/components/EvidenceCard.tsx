type Evidence = {
  id: string;
  summary: string;
  impact: string | null;
  companyValue: string | null;
  qualityScore: number | null;
  visibility: string;
  status?: string;
  sourceText?: string | null;
};

const STATUS_CLASS: Record<string, string> = {
  approved: "good",
  auto_approved: "good",
  pending_review: "warn",
  rejected: "bad",
  draft: "",
};

function qualityClass(score: number | null): string {
  if (score == null) return "";
  if (score >= 0.75) return "good";
  if (score >= 0.6) return "warn";
  return "bad";
}

export default function EvidenceCard({ evidence }: { evidence: Evidence }) {
  return (
    <div className="note" style={{ marginBottom: 8 }}>
      <div className="spread">
        <div className="small">
          {evidence.status && (
            <span
              className={`badge ${STATUS_CLASS[evidence.status] ?? ""}`}
              style={{ marginRight: 6 }}
            >
              {evidence.status.replace(/_/g, " ")}
            </span>
          )}
          {evidence.companyValue && (
            <span className="badge" style={{ marginRight: 6 }}>
              {evidence.companyValue}
            </span>
          )}
          {evidence.visibility === "allow_for_review" ? (
            <span className="badge good">review-approved</span>
          ) : (
            <span className="badge">{evidence.visibility}</span>
          )}
        </div>
        {evidence.qualityScore != null && (
          <span className={`badge ${qualityClass(evidence.qualityScore)}`}>
            quality {evidence.qualityScore.toFixed(2)}
          </span>
        )}
      </div>
      {evidence.sourceText && (
        <blockquote
          className="small"
          style={{
            margin: "6px 0 0",
            paddingLeft: 10,
            borderLeft: "3px solid var(--border, #555)",
            fontStyle: "italic",
          }}
        >
          “{evidence.sourceText}”
        </blockquote>
      )}
      <div style={{ marginTop: 6 }}>{evidence.summary}</div>
      {evidence.impact && (
        <div className="small muted" style={{ marginTop: 4 }}>
          Impact: {evidence.impact}
        </div>
      )}
    </div>
  );
}
