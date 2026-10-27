export function yesProb(yes: number, no: number) {
  const total = yes + no;
  return total === 0 ? 0.5 : yes / total;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;

export function ago(d: Date | string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const shortDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const CATEGORIES = ["General", "Teachers", "Students", "Classes", "District", "Education City", "Gossip", "Snow Days"];

export const REPORT_REASONS = ["Spam", "Not verifiable", "Abusive or hateful", "Duplicate", "Other"];
