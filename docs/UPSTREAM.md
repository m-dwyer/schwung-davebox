# Upstream tracking — dAVEBOx

Overture is a fork of **dAVEBOx** by Josh Gaines (MIT). This file is the
decision record for what we've taken from upstream and what we've deliberately
left behind. The git remote tells you *what changed* upstream; this ledger
records *what we decided about it*.

## Fork point

- **Upstream project:** dAVEBOx — <https://github.com/legsmechanical/schwung-davebox>
- **Forked at:** `v1.0b3+19` (commit `9fe1bcb5cc62f75db891bf27728f4c7ff1e52bfb`)
- **License:** MIT (© Josh Gaines); Overture additions © Em Dwyer — see `LICENSE`.

Overture restarted versioning at `0.x` under its own name. The inherited
dAVEBOx tags (`v0.1.0`…`v1.0b3`) live only in the archived upstream-mirror repo
(`m-dwyer/schwung-davebox`), not in the Overture monorepo, so the two version
lines never mingle.

## How to see what's new upstream

The mirror repo (`m-dwyer/schwung-davebox`) keeps an `upstream` remote pointing
at dAVEBOx. To review what's landed since the fork point:

```sh
# in the schwung-davebox mirror checkout
git fetch upstream
git log --oneline 9fe1bcb5..upstream/main            # all upstream commits since fork
git log --oneline 9fe1bcb5..upstream/main -- dsp/    # narrow to an area
git show upstream/main:CHANGELOG.md                  # read upstream's changelog
```

To port a specific upstream change into the Overture monorepo, cherry-pick it
across (histories are unrelated post-fold, but `git cherry-pick <sha>` still
works once the commit is fetched), then adapt and record the decision below.

## Last reviewed

- **Upstream version reviewed through:** `v1.0b3` (the fork point).
- **Upstream HEAD at last check:** `1.0b4` (~86 commits ahead of the fork point,
  un-triaged as of this writing).

Advance "reviewed through" as upstream releases are triaged.

## Triage log

One row per upstream change considered. Status: **ported** / **skipped** (with
reason) / **n/a** / **superseded** (our own work covers it).

| Upstream change | Version | Status | Notes |
|---|---|---|---|
| _(none triaged yet — upstream `1.0b3` → `1.0b4` pending)_ | | | |
