# MCP and Powers Configuration

## Overview

This document describes the Model Context Protocol (MCP) servers and Kiro powers configured for the GitReview-Radar project.

## MCP Servers

### 1. AWS MCP (`aws-mcp`)

**Purpose:** AWS service integration for infrastructure management, cost analysis, and AWS documentation lookup.

**Configuration:**
```json
{
  "command": "uvx",
  "args": [
    "mcp-proxy-for-aws@latest",
    "https://aws-mcp.us-east-1.api.aws/mcp",
    "--metadata",
    "INSTALL_SOURCE=aws-cli"
  ],
  "timeout": 100000,
  "transport": "stdio"
}
```

**Prerequisites:**
- AWS CLI installed and configured
- AWS credentials stored in `~/.aws/credentials`
- Region configured: `ap-southeast-1` (Singapore)

**Setup Commands:**
```bash
aws configure --profile default
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region name: ap-southeast-1
# Default output format: json
```

---

### 2. AWS Security Agent (`power-aws-security-agent-security-agent`)

**Purpose:** AI-powered security scanning, threat modeling, and penetration testing.

**Configuration:**
```json
{
  "command": "uvx",
  "args": ["awslabs.security-agent-mcp-server@latest"]
}
```

**Setup:**
1. Run `setup_check` to verify prerequisites
2. Run `setup` to provision agent space and IAM service role
3. Configure `WORKSPACE_ROOT` in `~/.kiro/powers/installed/aws-security-agent-kiro-power/mcp.json`:
   ```json
   {
     "env": {
       "WORKSPACE_ROOT": "/home/ubayed/GitReview-Radar"
     }
   }
   ```

---

## Kiro Powers

### Installed Powers

| Power | Purpose | Status |
|-------|---------|--------|
| `aws-security-agent` | Security scanning, threat modeling, pentesting | ✅ Active |

### Power Storage Location

Powers are installed locally at:
```
~/.kiro/powers/installed/
├── aws-security-agent/
└── aws-security-agent-kiro-power/
```

**Note:** Powers are user-specific and should NOT be committed to version control. They are installed automatically when first used.

---

## Usage Workflow

### AWS Security Agent

1. **Check setup status:**
   ```
   /security-agent setup_check
   ```

2. **Run security scan:**
   ```
   /security-agent start_security_scan(path="<path>", title="<title>")
   ```

3. **Check scan status:**
   ```
   /security-agent get_scan_status(scan_id="<id>")
   ```

4. **Get findings:**
   ```
   /security-agent get_scan_findings(scan_id="<id>")
   ```

---

## Environment-Specific Notes

### For Development Team

1. Each developer should configure their own MCP servers locally
2. Never commit `~/.kiro/settings/mcp.json` or any file containing credentials
3. Share setup instructions via this document
4. Use `.env.example` for environment variable templates

### For CI/CD

1. MCP servers are not used in CI/CD pipeline
2. AWS operations use IAM roles attached to CI/CD runners

---

## Troubleshooting

### AWS MCP fails to connect
- Verify AWS credentials: `aws sts get-caller-identity`
- Check region configuration: `aws configure get region`
- Ensure internet connectivity to AWS MCP endpoint

### Security Agent setup fails
- Verify IAM permissions for creating agent spaces and roles
- Check AWS region availability for Security Agent
- Review error message for specific missing permissions