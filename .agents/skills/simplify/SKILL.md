---
name: simplify
description: Simplify a change in the repo and apply the fixes — reuse, idiom, dead code, redundant comments. Use when asked to simplify, clean up or tidy a branch, commit or uncommitted work.
---

# Simplify a change

Make the change easier to read without changing what it does. Correctness bugs are out of scope; that is `review`.

## Scope

Default to uncommitted work plus the current branch against `master`. If the user names a branch, commit, range or PR, use that instead. When the target is a past commit, the fixes land in the working tree; say so.

Skip generated and vendored files: `Cargo.lock`, `pnpm-lock.yaml`, etc.

## What to look for

- Duplicated logic, or logic that re-implements something already in the workspace.
- Code the change made dead, and comments it made redundant.
- Code that could be reduced in size, without significant impacts to readability or performance.
- Code that is inneficient and could be made more performant.

Run your harness's general simplify pass if it's available to you: the `simplify` skill in Claude Code. Otherwise, simplify inline. Then add the repository-specific checks above. Aim for code a reviewer understands faster, not for a smaller diff.

## Finish

Run available checks for the surfaces you touched (linter, formatter, unit tests, etc.). If one fails, fix the cause or revert that simplification. Never weaken a test to make it pass.

Report what you changed, one line per change with `file:line`, and anything you chose not to change and why.
