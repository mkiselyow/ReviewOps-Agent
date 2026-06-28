type Evidence = {
  id: string;
  summary: string;
  impact: string | null;
  companyValue: string | null;
  qualityScore: number | null;
  visibility: string;
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
      <div style={{ marginTop: 6 }}>{evidence.summary}</div>
      {evidence.impact && (
        <div className="small muted" style={{ marginTop: 4 }}>
          Impact: {evidence.impact}
        </div>
      )}
    </div>
  );
}
