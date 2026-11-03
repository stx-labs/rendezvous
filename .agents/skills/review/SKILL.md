---
name: review
description: Review a change in the repo for correctness — a branch, a commit, uncommitted work or a pull request. Use when asked to review changes, review a PR, or check work before marking a PR ready. Reports findings without editing code.
---

# Review a change

Find defects in the change. Read-only: don't edit code unless the user then asks for fixes. To confirm a finding, you may write a throwaway test on a temporary branch or worktree, but remove it and leave no lasting changes. Never post to GitHub.

## Scope

Default to uncommitted work plus the current branch against `master`. If the user names a branch, commit, range or PR number, review that instead. For a PR, read its description and existing review comments first, so you don't repeat what has already been raised.

Pin down the intent from the PR description or commit messages. A change that contradicts its own stated intent is the first finding.

## Review

Run your harness's general review pass if it's available to you: the `code-review` skill in Claude Code, `codex review` in Codex. Pass the selected scope explicitly (for example, `--base master` or `--commit <sha>` for Codex), and review any uncovered portion inline. If no general review pass is available, review inline.

Report only defects the change introduces or exposes

Formatting and lint findings are the responsibility of other tools and are mostly outside the scope of this review. If there are any findings, note it as a single minor violation, but do not list the findings individually.

Check each finding against the surrounding code before reporting it. Drop the ones that don't hold up.

## Report

Group the findings: **blocking**, then **minor**, then **resolved** since the last review. For each, give `file:line`, the defect in one sentence, a unique number or label for easy reference, and the input or state that triggers it. If there are no findings, say so.

Write the report to `.agents/reviews/<name>.md` (gitignored), with `<name>` set to `PR-<number>` or the branch name with `/` replaced by `-`. If the file already exists, update it: move fixed findings to "Resolved" and add new ones. That way the next run, in any harness, picks up where this one stopped.

Keep a "History" section near the top of the file, right after the title.
Each time the report is updated, leave a single line in this section with the following information about the review and agent reviewing:

- Timestamp, as ISO 8601 Date and Time in UTC (example: 2026-10-27T18:03:47Z)
- Commit ID reviewed (first 8 characters)
- Model (Opus-5.5, GPT-6-Astra, etc.)
- Effort/reasoning level
- Harness

The entries should be formatted similar to these examples:

```
- 2026-10-27T18:03:47Z: Commit `f7b0fe95` reviewed by Opus-5.5/high/Claude Code
- 2026-10-27T17:38:25Z: Commit `dfa468f2` reviewed by GPT-6-Astra/medium/Codex
```
