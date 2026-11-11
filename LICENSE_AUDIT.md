# License decision

## Decision

Signal Window's original code is licensed under **AGPL-3.0-only** starting
with v0.1.1.

**Non-profit use is fully open.** Personal use, study, research, non-profit
community deployment, copying, modification, and distribution are not subject
to additional restrictions. Commercial use is still permitted by AGPL-3.0,
provided its source-offer obligations are met.

## Why AGPL-3.0 instead of GPL-3.0

This project is a network service:

```text
browser -> local gateway -> AstrBot OneBot WebSocket
```

GPL-3.0 requires source when distributing copies. It does not, by itself,
require source when a modified copy is merely operated as a network service.
AGPL-3.0 section 13 closes that gap. Since protection of the network service
is the secondary goal and compatibility with the code base is the primary
goal, AGPL-3.0 is the better fit.

## Borrowed-code and dependency audit

```text
No copied GPL/AGPL source found in the repository.
No vendored third-party source found.
Direct runtime dependencies: MIT.
Direct dev dependency TypeScript: Apache-2.0.
Other direct dev dependencies: MIT.
```

MIT and Apache-2.0 components remain under their own licenses. They are not
relicensed by this project. See `THIRD_PARTY_NOTICES.md`.

Apache-2.0 is compatible with GPLv3/AGPLv3 for combination in this project.
If a future contribution copies GPL/AGPL code, this decision must be audited
again; a non-permissive exception must not be added to that code.

## Prior versions

The old v0.1.0 MIT release has been removed. Copies already distributed
remain under MIT and cannot be retroactively relicensed. v0.1.1 and later
are AGPL-3.0-only.

## Compliance note

This is an engineering license audit, not legal advice. A full transitive
dependency and contribution audit should be completed before commercial
distribution.
