# NZBeam plugins

Plugins for [NZBeam](https://github.com/colin-m-t/nzbeam). A plugin is one folder holding one
file — `plugin.ts` — that the app imports and runs. There is no build step and no framework: Bun
runs the TypeScript as it is.

```ts
import { definePlugin } from 'nzbeam/sdk'

export default definePlugin({
  id: 'hello',
  name: 'Hello',
  version: '0.1.0',
  sdkVersion: 1,
  sdkMinor: 0,
  hooks: {
    'download:finished'({ download, log }) {
      log(`${download.name} landed`)
    },
  },
})
```

That is a whole plugin. Everything else in this repository is either an example to read or the
machinery that releases one.

## Writing one

```sh
git clone git@github.com:colin-m-t/nzbeam-plugins.git
cd nzbeam-plugins
bun install
bun run new my-plugin "What it does."
```

Then point your NZBeam at this checkout — in its `.env`:

```sh
PLUGINS_DIR=/path/to/nzbeam-plugins/plugins
```

Restart the container once, and from then on: edit the file, press **Reload plugins** under
Settings → Plugins, switch it on, watch it run. No copying, no symlink, no restart.

`bun run typecheck` before you send it in. That is the whole loop.

You do **not** need an NZBeam checkout: `sdk/nzbeam-sdk.ts` is committed here, and the root
`tsconfig.json` maps `nzbeam/sdk` to it, so your editor knows every hook and every setting type
from the clone alone.

### What a plugin can do

Hook into a download at each point of its life, judge a release or an NZB before it is queued,
change files on disk before they are moved, add a notification target, answer on a URL of its
own, run on a schedule, and keep its own settings, key/value store and SQLite database.

The reference is [`docs/PLUGIN_DEV.md`](https://github.com/colin-m-t/nzbeam/blob/master/docs/PLUGIN_DEV.md)
in nzbeam: every hook, what each is handed, what it may return, and how the app treats a plugin
that fails. [`plugins/sample-cleanup`](plugins/sample-cleanup) here is the worked example — it
uses a bit of everything.

### Sending one in

A pull request with one folder under `plugins/`: `plugin.ts` and a `README.md` saying what it
does and what its settings mean. CI typechecks it. Releasing it is a maintainer's job and takes
one command.

## Installing one

A plugin is a folder in NZBeam's plugins mount — `./data/plugins` on the host unless
`PLUGINS_DIR` says otherwise. Put the folder there, press **Reload plugins** under Settings →
Plugins, and switch it on. Nothing runs until you do.

Every released version is on the [download page](https://colin-m-t.github.io/nzbeam-plugins/),
with [`index.json`](https://colin-m-t.github.io/nzbeam-plugins/index.json) beside it.

**The release zip** — the version that was tested and tagged:

```sh
cd data/plugins
curl -L -O https://github.com/colin-m-t/nzbeam-plugins/releases/download/<plugin>@<version>/<plugin>-<version>.zip
unzip <plugin>-<version>.zip && rm <plugin>-<version>.zip
```

**The current folder from master** — newer than the newest release:

```sh
bunx degit colin-m-t/nzbeam-plugins/plugins/<plugin> data/plugins/<plugin>
```

**One file**, for a plugin that is only `plugin.ts`:

```sh
mkdir -p data/plugins/<plugin>
curl -L -o data/plugins/<plugin>/plugin.ts \
  https://raw.githubusercontent.com/colin-m-t/nzbeam-plugins/master/plugins/<plugin>/plugin.ts
```

While this repository is private, all three need a token or collaborator access. The same commands
work for everyone once it is public.

### Versions

A plugin's row says which SDK it was built for. A version that is not the app's is a note on the
row, never a refusal: the plugin loads, switches on and runs whatever it says. Releases are kept,
so if a plugin's newest version wants a newer NZBeam than you run, the older zip is still there.

## Maintaining this repository

| Command | What it does |
| --- | --- |
| `bun run new <id> ["What it does"]` | starts a plugin: a folder that loads and runs as it stands |
| `bun run typecheck [plugin]` | every plugin against `sdk/nzbeam-sdk.ts`, or one |
| `bun run release <plugin> <patch\|minor\|major>` | the whole of a release. `--dry-run` does everything but publish |
| `bun run sdk:sync` | brings `sdk/nzbeam-sdk.ts` up to date from a sibling nzbeam checkout. Only needed when the SDK itself changed |
| `bun run index` | builds `site/index.json` and the download page locally, as the tag's workflow does |

### Releasing

```sh
bun run release sample-cleanup patch
```

The bump level is the only thing typed by hand. The command bumps the plugin's version, stamps
the SDK major and minor it was tested against, typechecks it, commits what is outstanding in the
plugin's folder, tags `<plugin>@<version>` and pushes. The tag does the rest: GitHub builds the
zip, creates the release, and regenerates `index.json` and the download page from every tag there
has ever been. Old releases are left alone.

Releases are tagged off `master`, so merge first. Bump levels are not read out of commit messages
on purpose — conventional commits move that one decision from release time to every commit, which
is more room for mistakes.

### After an SDK change in nzbeam

```sh
bun run sdk:sync   # ../nzbeem by default; NZBEAM_REPO= for a checkout elsewhere
bun run typecheck  # the list of plugins the change reaches
```

Fix and release each. Until then they keep running for users under the version they were built
for.

### Layout

| | |
| --- | --- |
| `plugins/<id>/` | one folder per plugin: `plugin.ts` and a `README.md` |
| `sdk/` | the rolled-up SDK file, synced from nzbeam, never edited here |
| `scripts/` | the commands above |
| `.github/workflows/` | typecheck on a pull request, release on a tag |

Only `plugins/` is the mount, which is why plugins sit a folder down rather than at the root:
NZBeam lists any folder in the mount without a `plugin.ts` as a broken plugin, and `sdk/` beside
them would be exactly that.

## Licence

MIT. See [LICENSE](LICENSE).
