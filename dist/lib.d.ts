import type { getOctokit } from "@actions/github";
type OctokitInstance = ReturnType<typeof getOctokit>;
type ListArtifactsResponse = Awaited<ReturnType<OctokitInstance["rest"]["actions"]["listArtifactsForRepo"]>>;
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
export type Result<T, E = Error> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: E;
};
export declare const bytesToGB: (bytes: number) => number;
export declare const formatGB: (gb: number) => string;
export declare const calculateTotalSize: (artifacts: readonly Artifact[]) => number;
export declare const calculateStats: (artifacts: readonly Artifact[]) => ArtifactStats;
export declare const isOverLimit: (sizeBytes: number, maxSizeBytes: number) => boolean;
export declare const sortByCreatedDate: (artifacts: readonly Artifact[]) => readonly Artifact[];
export declare const calculateAge: (createdAt: string | null) => number;
export declare const selectArtifactsToDelete: (artifacts: readonly Artifact[], currentSize: number, maxSize: number) => readonly Artifact[];
export declare const createCleanupSummary: (initial: ArtifactStats, results: readonly DeletionResult[], retained: readonly Artifact[]) => CleanupSummary;
export {};
