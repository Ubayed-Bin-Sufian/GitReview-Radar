# Product Overview: PR-Pulse (GitReview Radar)

## Purpose
PR-Pulse is an open-source developer tool that ingests Pull Request metadata, evaluates actionability using TypeSafe AI's Jev model, and outputs daily prioritization digests for maintainers and engineering teams.

## Target Users
- **Software Engineering Teams**: Engineering managers, team leads, and developers who need rapid visibility into which PRs require immediate attention
- **Open-Source Maintainers**: Individual maintainers managing multiple repositories who want automated prioritization without manual review of every PR
- **DevOps & SRE Teams**: Teams needing CI/CD visibility with actionable insights into blocked or stale PRs

## Core Features

### 1. Jev-Powered Actionability Score (0-100)
- Uses TypeSafe AI's Jev System One for parallel primitive evaluation
- Calculates deterministic scores based on:
  - `CI_BLOCKED`: 95 + (diff_size / 100), capped at 100
  - `NEEDS_AUTHOR_FIX`: 85 + (diff_size / 200), capped at 100
  - `STALE_BRANCH`: 70 + (branch_staleness_days × 2), capped at 100
  - `READY_FOR_FINAL_MERGE`: (review_status == APPROVED ? 50 : 25) + (diff_size / 500), capped at 100

### 2. Smart Next-Step Owner Inference
Automatically routes PRs to the correct owner based on state:
- **Author**: Needs to address feedback or rebase stale branches
- **Maintainer**: Can merge or needs to address CI failures
- **Reviewer**: Fallback for edge cases requiring re-evaluation

### 3. Daily Notification Digest Summaries
- **Markdown Format**: Emoji-enhanced summaries with state breakdown, owner groups, top priorities, stale PRs, and CI blocked alerts
- **JSON Format**: Machine-readable format for webhook delivery to Slack, Discord, or email
- Configurable thresholds for stale PR detection and priority reporting

## Dual-Submission Goals
- **Kiro University Challenge**: Demonstrate agentic AI workflows with Jev decision primitives
- **AWS Builder Hackathon**: Showcase 100% stateless serverless architecture on Lambda, API Gateway, and EventBridge

## Non-Goals (Out of Scope)
- Real-time CI/CD pipeline integration (daily batch mode only)
- Direct GitHub PR creation/merging (read-only evaluation)
- Custom rule configuration UI (rules are code-configured)
