import type { ScopedTask } from "../clickup/client.js";

export interface AttentionReport {
  readonly source: "clickup-api-v2";
  readonly list_id: string;
  readonly evaluated_at_utc: string;
  readonly evaluated_at_sast: string;
  readonly lookahead_hours: number;
  readonly pages_scanned: number;
  readonly incomplete: boolean;
  readonly overdue: readonly ScopedTask[];
  readonly due_soon: readonly ScopedTask[];
  readonly not_updated_for_48h: readonly ScopedTask[];
}

/** Pure, clock-injected metadata report; "not updated" does not prove staff inactivity. */
export function createAttentionReport(
  tasks: readonly ScopedTask[],
  listId: string,
  pages: number,
  incomplete: boolean,
  lookaheadHours: number,
  includeOverdue: boolean,
  now: number,
): AttentionReport {
  if (!Number.isInteger(lookaheadHours) || lookaheadHours < 1 || lookaheadHours > 48 ||
      !Number.isFinite(now)) {
    throw new Error("Invalid attention report parameters");
  }
  const due = tasks.filter((task) => task.due_date_ms !== null);
  const overdue = includeOverdue
    ? due.filter((task) => task.due_date_ms! < now)
    : [];
  const dueSoon = due.filter((task) =>
    task.due_date_ms! >= now && task.due_date_ms! <= now + lookaheadHours * 3_600_000,
  );
  const stale = tasks.filter((task) =>
    task.date_updated_ms !== null && task.date_updated_ms <= now - 48 * 3_600_000,
  );
  const byDue = (a: ScopedTask, b: ScopedTask) =>
    (a.due_date_ms ?? 0) - (b.due_date_ms ?? 0) || a.id.localeCompare(b.id);
  const byUpdated = (a: ScopedTask, b: ScopedTask) =>
    (a.date_updated_ms ?? 0) - (b.date_updated_ms ?? 0) || a.id.localeCompare(b.id);
  return {
    source: "clickup-api-v2",
    list_id: listId,
    evaluated_at_utc: new Date(now).toISOString(),
    evaluated_at_sast: new Date(now + 7_200_000).toISOString().replace("Z", "+02:00"),
    lookahead_hours: lookaheadHours,
    pages_scanned: pages,
    incomplete,
    overdue: overdue.sort(byDue),
    due_soon: dueSoon.sort(byDue),
    not_updated_for_48h: stale.sort(byUpdated),
  };
}
