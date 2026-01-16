import * as core from "@actions/core";
import { getOctokit } from "@actions/github";
import {
  calculateAge,
  calculateStats,
  createCleanupSummary,
  formatGB,
  isOverLimit,
  selectArtifactsToDelete,
  type Artifact,
  type ArtifactStats,
  type CleanupSummary,
  type Config,
  type DeletionResult,
  type Result,
} from "./lib.js";

const parseConfig = (): Result<Config> => {
  try {
    const token = core.getInput("token") || process.env["GITHUB_TOKEN"];
    if (!token) {
      return {
        ok: false,
        error: new Error(
          "No token provided. Set the 'token' input or ensure GITHUB_TOKEN is available."
        ),
      };
    }

    const repository = process.env["GITHUB_REPOSITORY"];
    const maxSizeGBInput = core.getInput("max_size_gb");
    const dryRunInput = core.getInput("dry_run");

    if (!repository) {
      return { ok: false, error: new Error("GITHUB_REPOSITORY is not set") };
    }

    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
      return {
        ok: false,
        error: new Error("Invalid GITHUB_REPOSITORY format"),
      };
    }

    const maxSizeGB = parseFloat(maxSizeGBInput);
    if (isNaN(maxSizeGB) || maxSizeGB <= 0) {
      return { ok: false, error: new Error("Invalid max_size_gb value") };
    }

    const dryRun = dryRunInput === "true";

    return {
      ok: true,
      value: { owner, repo, maxSizeGB, token, dryRun },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};

const fetchAllArtifacts = async (
  config: Config
): Promise<Result<readonly Artifact[]>> => {
  try {
    const octokit = getOctokit(config.token);

    core.info("Fetching all artifacts...");

    const artifacts = await octokit.paginate(
      octokit.rest.actions.listArtifactsForRepo,
      {
        owner: config.owner,
        repo: config.repo,
        per_page: 100,
      }
    );

    return { ok: true, value: artifacts };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};

const deleteArtifact = async (
  config: Config,
  artifact: Artifact
): Promise<DeletionResult> => {
  try {
    if (config.dryRun) {
      return { artifact, success: true };
    }

    const octokit = getOctokit(config.token);

    await octokit.rest.actions.deleteArtifact({
      owner: config.owner,
      repo: config.repo,
      artifact_id: artifact.id,
    });

    return { artifact, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { artifact, success: false, error: errorMessage };
  }
};

const deleteArtifacts = async (
  config: Config,
  artifacts: readonly Artifact[]
): Promise<readonly DeletionResult[]> =>
  Promise.all(artifacts.map((artifact) => deleteArtifact(config, artifact)));

const logHeader = (config: Config): void => {
  core.info("=== Artifact Cleanup ===");
  if (config.dryRun) {
    core.info("MODE: DRY RUN (no artifacts will be deleted)");
  }
  core.info(`Repository: ${config.owner}/${config.repo}`);
  core.info(`Maximum size: ${formatGB(config.maxSizeGB)}GB`);
  core.info("");
};

const logStats = (label: string, stats: ArtifactStats): void => {
  core.info(`${label}:`);
  core.info(`  Artifacts: ${stats.totalCount}`);
  core.info(
    `  Total size: ${formatGB(stats.totalSizeGB)}GB (${stats.totalSizeBytes} bytes)`
  );
  core.info("");
};

const logArtifactDetails = (artifact: Artifact): void => {
  const sizeMB = artifact.size_in_bytes / 1024 ** 2;
  const age = calculateAge(artifact.created_at);

  core.info(`  Name: ${artifact.name}`);
  core.info(`  ID: ${artifact.id}`);
  core.info(`  Size: ${sizeMB.toFixed(2)}MB`);
  core.info(`  Age: ${age} days`);
  core.info(`  Created: ${artifact.created_at ?? "unknown"}`);
};

const logDeletionResult = (result: DeletionResult): void => {
  core.info(`Deleting: ${result.artifact.name}`);
  logArtifactDetails(result.artifact);

  if (result.success) {
    core.info("  ✓ Deleted successfully");
  } else {
    core.warning(`  ✗ Failed: ${result.error}`);
  }
  core.info("");
};

const logDeletionResults = (results: readonly DeletionResult[]): void => {
  core.info("Deleting oldest artifacts:");
  core.info("----------------------------------------");
  results.forEach(logDeletionResult);
};

const logRetainedArtifacts = (artifacts: readonly Artifact[]): void => {
  if (artifacts.length === 0) {
    core.info("No artifacts retained.");
    return;
  }

  core.info("Retained artifacts:");
  core.info("----------------------------------------");

  const sorted = [...artifacts].sort((a, b) => {
    const aTime = new Date(a.created_at ?? 0).getTime();
    const bTime = new Date(b.created_at ?? 0).getTime();
    return bTime - aTime; // Newest first
  });

  sorted.forEach((artifact, index) => {
    const sizeMB = artifact.size_in_bytes / 1024 ** 2;
    const age = calculateAge(artifact.created_at);
    core.info(`  ${index + 1}. ${artifact.name}`);
    core.info(`     Size: ${sizeMB.toFixed(2)}MB | Age: ${age} days`);
  });
  core.info("");
};

const logSummary = (summary: CleanupSummary, maxSizeGB: number): void => {
  core.info("========================================");
  core.info("Cleanup Summary:");
  core.info("========================================");
  core.info(`Artifacts deleted: ${summary.deletedCount}`);
  core.info(`Artifacts retained: ${summary.retained.length}`);
  core.info(`Space freed: ${formatGB(summary.freedGB)}GB`);
  core.info(`Final total size: ${formatGB(summary.finalSizeGB)}GB`);

  if (summary.failures.length > 0) {
    core.warning(`Failed deletions: ${summary.failures.length}`);
  }

  core.info("========================================");

  if (summary.finalSizeBytes <= maxSizeGB * 1024 ** 3) {
    core.info("✓ Storage is now under the limit.");
  } else {
    core.warning("⚠ Warning: Storage is still over the limit.");
    core.warning(
      "  Consider lowering the threshold or investigating artifacts."
    );
  }

  core.info("");
  logRetainedArtifacts(summary.retained);
};

const setOutputs = (summary: CleanupSummary, wasOverLimit: boolean): void => {
  core.setOutput("deleted_count", summary.deletedCount.toString());
  core.setOutput("freed_gb", formatGB(summary.freedGB));
  core.setOutput("final_size_gb", formatGB(summary.finalSizeGB));
  core.setOutput("was_over_limit", wasOverLimit.toString());
};

const writeJobSummary = async (
  summary: CleanupSummary,
  config: Config,
  wasOverLimit: boolean
): Promise<void> => {
  const statusIcon =
    summary.finalSizeBytes <= config.maxSizeGB * 1024 ** 3 ? "✅" : "⚠️";
  const modeLabel = config.dryRun ? " (Dry Run)" : "";

  await core.summary
    .addHeading(`Artifact Eviction${modeLabel}`)
    .addTable([
      [
        { data: "Metric", header: true },
        { data: "Value", header: true },
      ],
      ["Storage Limit", `${formatGB(config.maxSizeGB)} GB`],
      ["Initial Size", `${formatGB(summary.initial.totalSizeGB)} GB`],
      ["Artifacts Deleted", summary.deletedCount.toString()],
      ["Space Freed", `${formatGB(summary.freedGB)} GB`],
      ["Final Size", `${statusIcon} ${formatGB(summary.finalSizeGB)} GB`],
    ])
    .addRaw(
      wasOverLimit
        ? summary.deletedCount > 0
          ? `Deleted ${summary.deletedCount} artifact(s) to free ${formatGB(summary.freedGB)} GB.`
          : "Storage was over limit but no artifacts could be deleted."
        : "Storage was already under the limit. No cleanup needed."
    )
    .write();
};

const performCleanup = async (
  config: Config,
  artifacts: readonly Artifact[]
): Promise<Result<CleanupSummary>> => {
  const initialStats = calculateStats(artifacts);
  const maxSizeBytes = config.maxSizeGB * 1024 ** 3;

  logStats("Current storage", initialStats);
  core.info(
    `Maximum allowed: ${formatGB(config.maxSizeGB)}GB (${maxSizeBytes} bytes)`
  );
  core.info("");

  if (!isOverLimit(initialStats.totalSizeBytes, maxSizeBytes)) {
    core.info("✓ Total size is under the limit. No cleanup needed.");
    return {
      ok: true,
      value: {
        initial: initialStats,
        deletedCount: 0,
        freedBytes: 0,
        freedGB: 0,
        finalSizeBytes: initialStats.totalSizeBytes,
        finalSizeGB: initialStats.totalSizeGB,
        failures: [],
        retained: artifacts,
      },
    };
  }

  core.info("⚠ Total size exceeds limit. Starting cleanup...");
  core.info("");

  const toDelete = selectArtifactsToDelete(
    artifacts,
    initialStats.totalSizeBytes,
    maxSizeBytes
  );

  if (toDelete.length === 0) {
    return {
      ok: false,
      error: new Error(
        "No artifacts to delete, but still over limit. This should not happen."
      ),
    };
  }

  const results = await deleteArtifacts(config, toDelete);
  logDeletionResults(results);

  const toDeleteIds = new Set(toDelete.map((a) => a.id));
  const retained = artifacts.filter((a) => !toDeleteIds.has(a.id));

  const summary = createCleanupSummary(initialStats, results, retained);
  return { ok: true, value: summary };
};

const main = async (): Promise<Result<void>> => {
  const configResult = parseConfig();
  if (!configResult.ok) {
    return { ok: false, error: configResult.error };
  }

  const config = configResult.value;
  logHeader(config);

  const artifactsResult = await fetchAllArtifacts(config);
  if (!artifactsResult.ok) {
    return { ok: false, error: artifactsResult.error };
  }

  const artifacts = artifactsResult.value;
  core.info(`Found ${artifacts.length} total artifacts`);
  core.info("");

  const initialStats = calculateStats(artifacts);
  const maxSizeBytes = config.maxSizeGB * 1024 ** 3;
  const wasOverLimit = isOverLimit(initialStats.totalSizeBytes, maxSizeBytes);

  const cleanupResult = await performCleanup(config, artifacts);
  if (!cleanupResult.ok) {
    return { ok: false, error: cleanupResult.error };
  }

  const summary = cleanupResult.value;
  logSummary(summary, config.maxSizeGB);
  setOutputs(summary, wasOverLimit);
  await writeJobSummary(summary, config, wasOverLimit);

  return { ok: true, value: undefined };
};

main()
  .then((result) => {
    if (!result.ok) {
      core.setFailed(result.error.message);
      process.exit(1);
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Unexpected error: ${message}`);
    process.exit(1);
  });
