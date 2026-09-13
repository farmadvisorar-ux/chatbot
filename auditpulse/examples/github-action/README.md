# Fail the build when a deploy breaks your security posture

`auditpulse.yml` is a GitHub Actions workflow you copy into your own repository
at `.github/workflows/auditpulse.yml`. After each successful deploy it runs a
full AuditPulse audit against your live site and fails the run if that deploy
introduced a **Critical** or **High** finding the previous audit did not have.

Requires the **Growth** plan or above.

## Setup

1. In the dashboard, open **API keys** and create one. It is shown exactly once
   — copy it now.
2. In your repository, go to **Settings → Secrets and variables → Actions** and
   add:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `AUDITPULSE_API_KEY` | the key from step 1 |
   | Variable | `AUDITPULSE_TARGET_ID` | the site's id, shown beside it in the dashboard |

3. Copy `auditpulse.yml` to `.github/workflows/auditpulse.yml` and change
   `workflows: ["Deploy"]` to the name of your own deploy workflow.

Nothing else is installed: the job is `curl` and `jq`, both already present on
GitHub's hosted runners.

## Why "new" findings and not "any"

A gate that fails on every existing finding fails every build on day one, and
a gate that fails every build gets deleted in week one. What this catches is
the *regression* — the deploy that dropped a security header, pulled in a
vulnerable dependency, or added a third-party script that was not there
yesterday.

Your existing backlog still appears in every report and every alert. It just
does not block a commit that did not cause it.

The first audit of a site has nothing to compare against, so it establishes the
baseline and passes, and says so in the job summary rather than implying a
clean bill of health.

## Why it runs after deploy, not on the pull request

AuditPulse audits a running site over the network — TLS, response headers,
what a browser actually receives. A pull request branch is not deployed
anywhere it can see, so auditing on `pull_request` would grade whatever is
currently in production and attribute the result to the wrong commit.

If you deploy pull requests to preview URLs and want each one gated, add the
preview as its own site in the dashboard and point a second copy of this
workflow at that target id.

## What the API returns

`POST /api/scans` with `{"targetId": "...", "gate": true}`:

```json
{
  "scanId": "…",
  "gate": {
    "available": true,
    "passed": false,
    "baseline": false,
    "score": 54,
    "grade": "F",
    "blocking": [
      {
        "severity": "critical",
        "title": "TLS certificate is not trusted",
        "check_id": "tls-config",
        "affected_url": null,
        "remediation": "Install a certificate issued by a publicly trusted CA."
      }
    ],
    "new_non_blocking": 2
  }
}
```

The response is `201` whether the gate passed or failed — the audit itself
succeeded either way. Read `gate.passed` to decide the build, not the HTTP
status. `available: false` means the account is not on a plan that includes the
gate, and carries a `reason`.

Scans are limited to 60 per account per hour. A workflow that exceeds that gets
`429` with an explanation.

## Using the API directly

Any client works; the key goes in the `Authorization` header.

```bash
curl -sS https://brokehealth.com/api/targets \
  -H "Authorization: Bearer $AUDITPULSE_API_KEY"

curl -sS -X POST https://brokehealth.com/api/scans \
  -H "Authorization: Bearer $AUDITPULSE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"targetId":"…","gate":true}'

# Every finding from a scan, as CSV or JSON
curl -sS "https://brokehealth.com/api/scans/SCAN_ID?action=export&format=csv" \
  -H "Authorization: Bearer $AUDITPULSE_API_KEY" -o findings.csv
```

Keys carry every permission your account has, so treat one like a password:
store it as a secret, never commit it, and revoke it from the dashboard the
moment it might have leaked. Revocation takes effect on the next request.
