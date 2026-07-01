import type {
  Feedback,
  OneOnOneNote,
  PeerReview,
  PerformanceGoal,
} from "./contracts";

/**
 * Synthetic Lattice-shaped performance data for the demo reports (Anna, Mark,
 * Julia under Maria). A real PerformanceConnector would fetch the same shapes
 * from the vendor API. Cycle matches the demo period 2026-Q2.
 */

export const PEER_REVIEWS: PeerReview[] = [
  {
    id: "pr_anna_1",
    subjectEmployeeId: "u_anna",
    reviewerEmployeeId: "u_mark",
    cycle: "2026-Q2",
    competency: "Collaboration",
    rating: 5,
    comment:
      "Anna pair-programmed with me on the billing refactor and unblocked a tricky layout bug; she explains tradeoffs clearly.",
    submittedAt: "2026-06-10",
  },
  {
    id: "pr_anna_2",
    subjectEmployeeId: "u_anna",
    reviewerEmployeeId: "u_julia",
    cycle: "2026-Q2",
    competency: "Craft",
    rating: 4,
    comment:
      "Solid, well-tested components. Could share design decisions a bit earlier so the team can weigh in.",
    submittedAt: "2026-06-12",
  },
  {
    id: "pr_mark_1",
    subjectEmployeeId: "u_mark",
    reviewerEmployeeId: "u_anna",
    cycle: "2026-Q2",
    competency: "Ownership",
    rating: 4,
    comment:
      "Mark owned the visual-regression CI work end to end and kept the team informed.",
    submittedAt: "2026-06-11",
  },
];

export const FEEDBACK: Feedback[] = [
  {
    id: "fb_anna_1",
    toEmployeeId: "u_anna",
    fromEmployeeId: "u_maria",
    date: "2026-05-28",
    text: "Great job mentoring the new hire through their first PR — your review comments were specific and kind.",
    tags: ["mentorship", "collaboration"],
  },
  {
    id: "fb_julia_1",
    toEmployeeId: "u_julia",
    fromEmployeeId: "u_mark",
    date: "2026-06-02",
    text: "Julia's accessibility audit caught issues the rest of us missed.",
    tags: ["accessibility", "quality"],
  },
];

export const ONE_ON_ONES: OneOnOneNote[] = [
  {
    id: "1on1_anna_1",
    managerId: "u_maria",
    employeeId: "u_anna",
    date: "2026-06-05",
    summary:
      "Discussed growth toward a senior role; Anna wants more design-system ownership. Agreed she'll lead the tooltip consolidation.",
  },
  {
    id: "1on1_mark_1",
    managerId: "u_maria",
    employeeId: "u_mark",
    date: "2026-06-06",
    summary:
      "Mark is interested in CI/CD; assigned the release-pipeline hardening as a stretch goal.",
  },
];

export const PERFORMANCE_GOALS: PerformanceGoal[] = [
  { id: "pg_anna_1", employeeId: "u_anna", title: "Lead the design-system tooltip consolidation", status: "on_track", cycle: "2026-Q2" },
  { id: "pg_mark_1", employeeId: "u_mark", title: "Harden the release pipeline", status: "on_track", cycle: "2026-Q2" },
];
