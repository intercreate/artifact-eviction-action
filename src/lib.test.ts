import { describe, expect, it } from "vitest";
import {
  bytesToGB,
  calculateAge,
  calculateStats,
  calculateTotalSize,
  createCleanupSummary,
  formatGB,
  isOverLimit,
  selectArtifactsToDelete,
  sortByCreatedDate,
  type Artifact,
} from "./lib.js";

const createMockArtifact = (
  overrides: Partial<Artifact> & { id: number; size_in_bytes: number }
): Artifact =>
  ({
    id: overrides.id,
    name: overrides.name ?? `artifact-${overrides.id}`,
    size_in_bytes: overrides.size_in_bytes,
    created_at: overrides.created_at ?? "2024-01-01T00:00:00Z",
    node_id: "",
    url: "",
    archive_download_url: "",
    expired: false,
    workflow_run: null,
  }) as Artifact;

describe("bytesToGB", () => {
  it("converts bytes to gigabytes", () => {
    expect(bytesToGB(0)).toBe(0);
    expect(bytesToGB(1024 ** 3)).toBe(1);
    expect(bytesToGB(2 * 1024 ** 3)).toBe(2);
    expect(bytesToGB(512 * 1024 ** 2)).toBe(0.5);
  });
});

describe("formatGB", () => {
  it("formats GB with 2 decimal places", () => {
    expect(formatGB(0)).toBe("0.00");
    expect(formatGB(1)).toBe("1.00");
    expect(formatGB(1.5)).toBe("1.50");
    expect(formatGB(1.234)).toBe("1.23");
    expect(formatGB(1.999)).toBe("2.00");
  });
});

describe("calculateTotalSize", () => {
  it("returns 0 for empty array", () => {
    expect(calculateTotalSize([])).toBe(0);
  });

  it("sums artifact sizes", () => {
    const artifacts = [
      createMockArtifact({ id: 1, size_in_bytes: 100 }),
      createMockArtifact({ id: 2, size_in_bytes: 200 }),
      createMockArtifact({ id: 3, size_in_bytes: 300 }),
    ];
    expect(calculateTotalSize(artifacts)).toBe(600);
  });
});

describe("calculateStats", () => {
  it("calculates stats for artifacts", () => {
    const artifacts = [
      createMockArtifact({ id: 1, size_in_bytes: 1024 ** 3 }),
      createMockArtifact({ id: 2, size_in_bytes: 1024 ** 3 }),
    ];
    const stats = calculateStats(artifacts);
    expect(stats.totalCount).toBe(2);
    expect(stats.totalSizeBytes).toBe(2 * 1024 ** 3);
    expect(stats.totalSizeGB).toBe(2);
  });

  it("handles empty array", () => {
    const stats = calculateStats([]);
    expect(stats.totalCount).toBe(0);
    expect(stats.totalSizeBytes).toBe(0);
    expect(stats.totalSizeGB).toBe(0);
  });
});

describe("isOverLimit", () => {
  it("returns true when over limit", () => {
    expect(isOverLimit(100, 50)).toBe(true);
  });

  it("returns false when under limit", () => {
    expect(isOverLimit(50, 100)).toBe(false);
  });

  it("returns false when at limit", () => {
    expect(isOverLimit(100, 100)).toBe(false);
  });
});

describe("sortByCreatedDate", () => {
  it("sorts artifacts oldest first", () => {
    const artifacts = [
      createMockArtifact({
        id: 3,
        size_in_bytes: 100,
        created_at: "2024-03-01T00:00:00Z",
      }),
      createMockArtifact({
        id: 1,
        size_in_bytes: 100,
        created_at: "2024-01-01T00:00:00Z",
      }),
      createMockArtifact({
        id: 2,
        size_in_bytes: 100,
        created_at: "2024-02-01T00:00:00Z",
      }),
    ];

    const sorted = sortByCreatedDate(artifacts);

    expect(sorted[0]?.id).toBe(1);
    expect(sorted[1]?.id).toBe(2);
    expect(sorted[2]?.id).toBe(3);
  });

  it("does not mutate original array", () => {
    const artifacts = [
      createMockArtifact({
        id: 2,
        size_in_bytes: 100,
        created_at: "2024-02-01T00:00:00Z",
      }),
      createMockArtifact({
        id: 1,
        size_in_bytes: 100,
        created_at: "2024-01-01T00:00:00Z",
      }),
    ];

    sortByCreatedDate(artifacts);

    expect(artifacts[0]?.id).toBe(2);
  });
});

describe("calculateAge", () => {
  it("calculates age in days", () => {
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    expect(calculateAge(oneDayAgo)).toBe(1);
    expect(calculateAge(sevenDaysAgo)).toBe(7);
  });

  it("handles null created_at", () => {
    const age = calculateAge(null);
    expect(age).toBeGreaterThan(0);
  });
});

describe("selectArtifactsToDelete", () => {
  it("returns empty array when under limit", () => {
    const artifacts = [
      createMockArtifact({ id: 1, size_in_bytes: 100 }),
      createMockArtifact({ id: 2, size_in_bytes: 100 }),
    ];

    const toDelete = selectArtifactsToDelete(artifacts, 200, 500);

    expect(toDelete).toHaveLength(0);
  });

  it("selects oldest artifacts first", () => {
    const artifacts = [
      createMockArtifact({
        id: 3,
        size_in_bytes: 100,
        created_at: "2024-03-01T00:00:00Z",
      }),
      createMockArtifact({
        id: 1,
        size_in_bytes: 100,
        created_at: "2024-01-01T00:00:00Z",
      }),
      createMockArtifact({
        id: 2,
        size_in_bytes: 100,
        created_at: "2024-02-01T00:00:00Z",
      }),
    ];

    const toDelete = selectArtifactsToDelete(artifacts, 300, 150);

    expect(toDelete).toHaveLength(2);
    expect(toDelete[0]?.id).toBe(1);
    expect(toDelete[1]?.id).toBe(2);
  });

  it("stops when under limit", () => {
    const artifacts = [
      createMockArtifact({
        id: 1,
        size_in_bytes: 100,
        created_at: "2024-01-01T00:00:00Z",
      }),
      createMockArtifact({
        id: 2,
        size_in_bytes: 100,
        created_at: "2024-02-01T00:00:00Z",
      }),
      createMockArtifact({
        id: 3,
        size_in_bytes: 100,
        created_at: "2024-03-01T00:00:00Z",
      }),
    ];

    const toDelete = selectArtifactsToDelete(artifacts, 300, 200);

    expect(toDelete).toHaveLength(1);
    expect(toDelete[0]?.id).toBe(1);
  });
});

describe("createCleanupSummary", () => {
  it("creates summary with successful deletions", () => {
    const initial = { totalCount: 3, totalSizeBytes: 300, totalSizeGB: 0.0003 };
    const artifact1 = createMockArtifact({ id: 1, size_in_bytes: 100 });
    const artifact2 = createMockArtifact({ id: 2, size_in_bytes: 100 });
    const retained = createMockArtifact({ id: 3, size_in_bytes: 100 });

    const results = [
      { artifact: artifact1, success: true },
      { artifact: artifact2, success: true },
    ];

    const summary = createCleanupSummary(initial, results, [retained]);

    expect(summary.deletedCount).toBe(2);
    expect(summary.freedBytes).toBe(200);
    expect(summary.finalSizeBytes).toBe(100);
    expect(summary.failures).toHaveLength(0);
    expect(summary.retained).toHaveLength(1);
  });

  it("tracks failed deletions", () => {
    const initial = { totalCount: 2, totalSizeBytes: 200, totalSizeGB: 0.0002 };
    const artifact1 = createMockArtifact({ id: 1, size_in_bytes: 100 });
    const artifact2 = createMockArtifact({ id: 2, size_in_bytes: 100 });

    const results = [
      { artifact: artifact1, success: true },
      { artifact: artifact2, success: false, error: "Failed" },
    ];

    const summary = createCleanupSummary(initial, results, []);

    expect(summary.deletedCount).toBe(1);
    expect(summary.freedBytes).toBe(100);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.artifact.id).toBe(2);
  });
});
