import type { getOctokit } from "@actions/github";

type OctokitInstance = ReturnType<typeof getOctokit>;
type ListArtifactsResponse = Awaited<
  ReturnType<OctokitInstance["rest"]["actions"]["listArtifactsForRepo"]>
>;

export type Artifact = ListArtifactsResponse["data"]["artifacts"][number];

export type Config = {
  readonly owner: string;
  readonly repo: string;
  readonly maxSizeGB: number;
  readonly token: string;
  readonly dryRun: boolean;
};

export type ArtifactStats = {
  readonly totalCount: number;
  readonly totalSizeBytes: number;
  readonly totalSizeGB: number;
};

export type DeletionResult = {
  readonly artifact: Artifact;
  readonly success: boolean;
  readonly error?: string;
};

export type CleanupSummary = {
  readonly initial: ArtifactStats;
  readonly deletedCount: number;
  readonly freedBytes: number;
  readonly freedGB: number;
  readonly finalSizeBytes: number;
  readonly finalSizeGB: number;
  readonly failures: readonly DeletionResult[];
  readonly retained: readonly Artifact[];
};

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const bytesToGB = (bytes: number): number => bytes / 1024 ** 3;

export const formatGB = (gb: number): string => gb.toFixed(2);

export const calculateTotalSize = (artifacts: readonly Artifact[]): number =>
  artifacts.reduce((sum, artifact) => sum + artifact.size_in_bytes, 0);

export const calculateStats = (
  artifacts: readonly Artifact[]
): ArtifactStats => {
  const totalSizeBytes = calculateTotalSize(artifacts);
  return {
    totalCount: artifacts.length,
    totalSizeBytes,
    totalSizeGB: bytesToGB(totalSizeBytes),
  };
};

export const isOverLimit = (sizeBytes: number, maxSizeBytes: number): boolean =>
  sizeBytes > maxSizeBytes;

export const sortByCreatedDate = (
  artifacts: readonly Artifact[]
): readonly Artifact[] =>
  [...artifacts].sort((a, b) => {
    const aTime = new Date(a.created_at ?? 0).getTime();
    const bTime = new Date(b.created_at ?? 0).getTime();
    return aTime - bTime;
  });

export const calculateAge = (createdAt: string | null): number => {
  const createdTime = new Date(createdAt ?? 0).getTime();
  const now = Date.now();
  return Math.floor((now - createdTime) / (1000 * 60 * 60 * 24));
};

export const selectArtifactsToDelete = (
  artifacts: readonly Artifact[],
  currentSize: number,
  maxSize: number
): readonly Artifact[] => {
  if (currentSize <= maxSize) {
    return [];
  }

  const sorted = sortByCreatedDate(artifacts);
  const toDelete: Artifact[] = [];
  let remainingSize = currentSize;

  for (const artifact of sorted) {
    if (remainingSize <= maxSize) {
      break;
    }
    toDelete.push(artifact);
    remainingSize -= artifact.size_in_bytes;
  }

  return toDelete;
};

export const createCleanupSummary = (
  initial: ArtifactStats,
  results: readonly DeletionResult[],
  retained: readonly Artifact[]
): CleanupSummary => {
  const successful = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  const freedBytes = successful.reduce(
    (sum, result) => sum + result.artifact.size_in_bytes,
    0
  );

  return {
    initial,
    deletedCount: successful.length,
    freedBytes,
    freedGB: bytesToGB(freedBytes),
    finalSizeBytes: initial.totalSizeBytes - freedBytes,
    finalSizeGB: bytesToGB(initial.totalSizeBytes - freedBytes),
    failures,
    retained,
  };
};
