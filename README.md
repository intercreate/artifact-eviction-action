# Artifact Eviction Action

A GitHub Action that automatically evicts the oldest artifacts from your repository to stay under user-defined storage limits.

## Usage

```yaml
- uses: intercreate/artifact-eviction-action@v1
  with:
    token: ${{ github.token }}
```

No checkout required - the action is self-contained.

## Inputs

| Input         | Description                                  | Required | Default |
| ------------- | -------------------------------------------- | -------- | ------- |
| `token`       | GitHub token with `actions:write` permission | Yes      | —       |
| `max_size_gb` | Maximum total artifact storage size in GB    | No       | `20`    |
| `dry_run`     | Preview deletions without actually deleting  | No       | `false` |

## Outputs

| Output           | Description                                       |
| ---------------- | ------------------------------------------------- |
| `deleted_count`  | Number of artifacts deleted                       |
| `freed_gb`       | Storage freed in GB                               |
| `final_size_gb`  | Final storage size in GB after cleanup            |
| `was_over_limit` | Whether storage was over the limit before cleanup |

## Permissions

The action requires the `actions: write` permission to delete artifacts:

```yaml
permissions:
  actions: write
```

## Examples

### Manual Trigger with Dry Run

```yaml
name: Artifact Cleanup

on:
  workflow_dispatch:
    inputs:
      max_size_gb:
        description: "Maximum total artifact storage size in GB"
        required: true
        default: "10"
      dry_run:
        description: "Preview deletions without actually deleting"
        required: false
        default: true
        type: boolean

jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: intercreate/artifact-eviction-action@v1
        with:
          token: ${{ github.token }}
          max_size_gb: ${{ inputs.max_size_gb }}
          dry_run: ${{ inputs.dry_run }}
```

### Scheduled Weekly Cleanup

```yaml
name: Artifact Cleanup

on:
  schedule:
    - cron: "0 0 * * 0" # Weekly on Sunday at midnight

jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: intercreate/artifact-eviction-action@v1
        with:
          token: ${{ github.token }}
          max_size_gb: "20"
```

### Using a Personal Access Token

If you need to clean artifacts across multiple repositories, use a PAT with the appropriate permissions:

```yaml
- uses: intercreate/artifact-eviction-action@v1
  with:
    token: ${{ secrets.ARTIFACT_CLEANUP_TOKEN }}
    max_size_gb: "10"
```

## How It Works

1. Fetches all artifacts in the repository
2. Calculates total storage usage
3. If over the limit, sorts artifacts by creation date (oldest first)
4. Deletes oldest artifacts until total size is under the threshold
5. Reports summary of deletions and remaining artifacts

## Job Summary

The action writes a summary table to the GitHub Actions Job Summary showing:

- Storage limit and initial/final sizes
- Number of artifacts deleted and space freed
- Status indicator (under/over limit)

## Logs

The action also logs detailed information to the console:

- Current storage usage
- Each artifact being deleted (name, size, age)
- Final storage size after cleanup
- List of retained artifacts
