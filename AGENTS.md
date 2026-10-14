# Test lifecycle and retirement

YouLoop is low risk and can tolerate occasional minor bugs. Prefer tests that catch
likely regressions that would be costly to diagnose, with stable, actionable
failures. Test count and coverage are not quality targets. Retiring tests is part
of normal development.

## Choose a lifetime

- **PR proof (default for one-off changes):** Use tests or manual checks to verify
  behavior during implementation and review. Keep them on `main` only when they
  have future regression value. If a temporary automated test is committed for CI,
  preserve its earlier passing run and remove the test in a later PR commit before
  merge. Link the evidence and explain the deletion in the PR summary. The final
  commit must still pass the regular required suite.
- **Probationary:** Keep a check during stabilization with a clear review trigger,
  such as the next few related PRs or approximately 30 days, and an owner or
  explicit follow-up decision. At review, retire it or promote it with a rationale.
- **Permanent:** Retain tests for important, likely, or difficult-to-diagnose
  recurring regressions. Catching a real bug once does not make a test permanent.

A removed route can be checked for a 404 in its removal PR. Ordinarily delete that
specific assertion before merge unless the route's absence remains a security or
compatibility requirement. Core Loop/Once clip semantics and signed URL handling
have higher continuing regression value.

## Reconsider existing tests

When changing or removing a feature, review its tests for obsolete contracts,
duplicates, costly waits, and false positives. Delete checks that no longer earn
their maintenance and runtime cost, whether required or advisory. Moving every
low-value test into advisory forever is not retirement.

Diagnose useful failures. Fix, demote, or delete unreliable network-duration waits;
avoid broad retries or timeout increases that merely produce green results.
Advisory checks may fail; report those failures accurately.

## Select checks within a soft budget

Use small, fast Node tests for logic and targeted Playwright tests with mocked
providers for UI contracts. Keep WebKit and real-YouTube cases representative and
uniquely valuable rather than repeating every Chromium case.

The routine `pnpm test:browser` baseline is about 36 browser executions (28 Chromium,
8 WebKit), taking about 57 seconds locally. Current counts and roughly one minute
are soft reference budgets, never hard quotas. Explain why significant persistent
additions earn their runtime and, where practical, offset them by retiring
low-value coverage. Reassess the broader `pnpm test:browser:advisory` selection too.

See [README.md](README.md#required-verification) for commands, setup, suite selection,
and profiling details.

## Review in each PR

State what behavior was verified, which new tests will remain, for how long and
why, and which existing tests became unnecessary. A brief PR-body sentence is
enough. Do not require an annotation on every test, a mandatory comment format,
an issue for each test, expiry tooling, or unattended scheduled deletion.
