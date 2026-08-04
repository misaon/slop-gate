# Security Policy

## Supported versions

slop-gate is pre-1.0. Only the latest published release receives security fixes.

| Version | Supported |
| ------- | --------- |
| latest  | yes       |
| older   | no        |

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through GitHub's [private vulnerability reporting][advisories] — the
*Report a vulnerability* button on the Security tab. It creates a draft advisory only the
maintainers can see, and it is the fastest way to reach us.

If that is unavailable to you, email **ondrej.misak@techfides.cz** with `slop-gate security`
in the subject.

Please include what you can: affected version, what an attacker gains, and the smallest
reproduction you have. A rough report today beats a polished one next month.

### What to expect

- **Acknowledgement within 3 working days.** If you do not hear back, assume it went astray
  and ping the maintainer publicly *without details* — "I sent a security report, did it
  arrive?" is fine to say in the open.
- An assessment and a fix plan once we have reproduced it.
- Credit in the advisory and the release notes, unless you would rather not be named.

This is a small project maintained in the open; there is no bug bounty.

## Scope

slop-gate runs analysers over source code you point it at, and downloads two of them
(`actionlint`, `hadolint`) plus an advisory snapshot from the network. Things we consider
in scope:

- Anything that lets **repository content being analysed** cause code execution, a write
  outside the analysed tree, or an escape from the working directory.
- Tampering with a downloaded binary or the advisory snapshot being accepted.
- Credentials or tokens leaking into a report, a cache entry or a log.

Out of scope: vulnerabilities in the analysers themselves — report those upstream — and
findings that require an attacker to already control the machine running `sgate`.

[advisories]: https://github.com/misaon/slop-gate/security/advisories/new
