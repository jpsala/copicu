# Draft Code Signing Policy

Status: draft. This policy is not active until Copicu is accepted by a
signing provider and JP confirms publication.

## Intended Provider

Copicu plans to pursue open-source Windows Authenticode signing, starting with
SignPath Foundation if the project qualifies.

When approved, the public policy should include the SignPath-required notice:

> Free code signing provided by [SignPath.io](https://about.signpath.io),
> certificate by [SignPath Foundation](https://signpath.org).

Do not publish that notice as active until SignPath approves the project.

## Scope

Signing scope, once active:

- Copicu Windows release artifacts built from this repository.
- Authenticode signatures for the Windows installer and any eligible Copicu PE
  binaries produced by the release workflow.

Out of scope:

- Signing third-party binaries as Copicu-owned artifacts.
- Signing local dogfood/dev builds.
- Claiming SmartScreen warnings are gone before testing on clean machines.

## Roles

TODO before applying:

- Authors/committers: JP / GitHub team or user link.
- Reviewers: JP / GitHub team or user link.
- Approvers: JP / GitHub owner or SignPath approver link.

All members with signing authority must use MFA on GitHub and SignPath.

## Privacy Statement Candidate

Copicu is a local clipboard manager. Public policy copy must stay aligned with
the actual product docs and release behavior.

Candidate wording, to verify before publication:

> This program will not transfer clipboard contents or other user information
> to networked systems unless specifically requested by the user or the person
> installing or operating it.

## Build And Approval Policy

Expected release-signing constraints:

1. Build release artifacts from a GitHub Actions workflow on GitHub-hosted
   Windows runners.
2. Upload the unsigned artifact as a workflow artifact before submitting it to
   SignPath.
3. Require manual approval for each signing request.
4. Enforce artifact metadata restrictions in SignPath:
   - product name: `Copicu`;
   - product/file version: same project version for all signed Copicu binaries.
5. Verify the returned signed installer with `Get-AuthenticodeSignature` and
   publish SHA256 for the final artifact bytes.

## Release Communication

Release notes should state:

- whether the installer is signed or unsigned;
- publisher/certificate identity;
- SHA256 of the final published installer;
- expected warning state if SmartScreen reputation is still warming up.

Avoid claims like `no warning`, `secure`, or `trusted` until verified on clean
machines.
