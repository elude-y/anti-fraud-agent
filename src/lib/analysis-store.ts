import type { AnalysisStreamResult } from "@/lib/contracts";

export interface StoredAnalysis {
  id: string;
  input: string;
  mode: "link" | "message";
  createdAt: string;
  result: AnalysisStreamResult;
}

const snapshotsKey = "safeagent:snapshots";

function writeStoredAnalyses(items: StoredAnalysis[]) {
  localStorage.setItem(snapshotsKey, JSON.stringify(items.slice(0, 30)));
}

export function loadStoredAnalyses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(snapshotsKey) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed as StoredAnalysis[] : [];
  } catch {
    return [];
  }
}

export function loadStoredAnalysis(id: string) {
  return loadStoredAnalyses().find((item) => item.id === id) ?? null;
}

export function saveStoredAnalysis(analysis: StoredAnalysis) {
  const current = loadStoredAnalyses().filter((item) => item.id !== analysis.id);
  writeStoredAnalyses([analysis, ...current]);
}
