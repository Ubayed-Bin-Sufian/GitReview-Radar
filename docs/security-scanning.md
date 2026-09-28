# Security Scanning with AWS Security Agent

## Overview

This document describes how the AWS Security Agent power was used to identify security issues in the GitReview-Radar project.

## Setup Process

### 1. Prerequisites Verification

First, verified the AWS Security Agent prerequisites:

```bash
/security-agent setup_check
```

Result: `{"ready": false, "missing": ["agent_space_id", "service_role"], "config": {}}`

### 2. Provisioning Agent Space and IAM Role

Created a new agent space and IAM service role:

```bash
/security-agent setup(name="gitreview-radar")
```

Result:
- **Agent Space ID:** `as-4ef4ed59-629f-45a2-883f-a6b0e19372c0`
- **Service Role:** `arn:aws:iam::570064632926:role/SecurityAgentScanRole`
- **Account ID:** `570064632926`

### 3. Workspace Root Configuration

Created `~/.kiro/powers/installed/aws-security-agent-kiro-power/mcp.json` to restrict scans to the project directory:

```json
{
  "env": {
    "WORKSPACE_ROOT": "/home/ubayed/GitReview-Radar"
  }
}
```

## Security Scans Performed

### Full Security Scan

Initiated a full security scan of the codebase:

```bash
/security-agent start_security_scan(
  path="/home/ubayed/GitReview-Radar",
  title="gitreview-radar-main"
)
```

Result:
- **Scan ID:** `scan-9f71238a`
- **Status:** STARTED → IN_PROGRESS → COMPLETED
- **Duration:** ~1 hour 48 minutes
- **Code Review ID:** `cr-0b5f3502-aa07-4f3b-9cb2-c76a3767241a`
- **Job ID:** `cj-403149ec-566b-4391-88c8-b90c66e5f454`

## Scan Results

### Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 7 |
| LOW | 3 |
| **Total** | **12** |

### HIGH Severity Findings

#### 1. S3 Website Security Issues (f-21ed5fb8)

**Name:** Credential-entry dashboard served from a public-read, HTTP-only S3 website with every Block Public Access guard disabled

**Description:**
- The dashboard for entering credentials is hosted as an S3 static website with `publicReadAccess: true`
- All four Block Public Access guards are disabled
- No TLS termination - S3 website endpoints serve plain HTTP only
- No Content Security Policy (CSP) or security headers
- Wildcard CORS configuration allows cross-origin access

**Impact:**
- No transport security for credential-entry page
- Credentials (password, GitHub PAT, LLM API key) exposed to script substitution
- Wildcard CORS allows cross-origin read of responses

**Files Affected:**
- `infrastructure/lib/pr-pulse-stack.ts:113-124` - S3 bucket configuration
- `web/src/App.tsx:93-118` - Credential handling
- `web/src/supabase.ts:6` - JWT stored in localStorage

#### 2. Missing Authentication on /evaluate Endpoint (f-166a017f)

**Name:** POST /evaluate is exposed with no authorizer and no in-handler identity check

**Description:**
- The `/evaluate` route is registered with no authorizer
- No default authorizer on the HttpApi
- No IAM auth, API key, or usage plan
- Handler performs no caller identification

**Impact:**
- Unbounded invocations of Lambda possible
- Unmetered LLM proxy if `JEV_API_KEY` is set
- No rate limiting or usage tracking

**Files Affected:**
- `infrastructure/lib/pr-pulse-stack.ts:94-98` - Route configuration
- `src/handlers/evaluate.ts:31-58` - Handler without auth check

## Findings Repository

All raw findings are stored in:
```
.security-agent/findings-scan-9f71238a.json
```

This JSON file contains complete details including:
- Finding ID
- Name and description
- Risk level and type
- Confidence score
- Code locations with file paths and line numbers
- Remediation guidance (when available)

## Remediation Workflow

To remediate findings:

1. Review findings grouped by severity
2. Read detailed remediation code from findings
3. Apply fixes to source code
4. Run a diff scan to verify fixes

## Notes

- Security Agent requires AWS credentials configured via `aws configure`
- Setup is one-time per AWS account
- Each workspace should have its own agent space
- Scan duration varies based on codebase size
- Diff scans are faster (~10-15 min) for checking changes