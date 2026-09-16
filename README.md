# NZBeam plugins

Plugins for [NZBeam](https://github.com/colin-m-t/nzbeam). One folder per plugin under
`plugins/`, each a single `plugin.ts` that the app imports and runs. There is no build step: Bun
runs the TypeScript as it is.

Every released version is on the [download page](https://colin-m-t.github.io/nzbeam-plugins/),
which is generated from the releases, as is
[`index.json`](https://colin-m-t.github.io/nzbeam-plugins/index.json) beside it.

## Installing one

A plugin is a folder in NZBeam's plugins mount — `./data/plugins` on the host unless `PLUGINS_DIR`
says otherwise. Put the folder there, press **Reload plugins** under Settings → Plugins, and
switch it on. Nothing runs until you do.

**The release zip**, which is the version that was tested and tagged:

```sh
cd data/plugins
curl -L -O https://github.com/colin-m-t/nzbeam-plugins/releases/download/<plugin>@<version>/<plugin>-<version>.zip
unzip <plugin>-<version>.zip && rm <plugin>-<version>.zip
```

**The current folder from master**, which is the newest code rather than the newest release:

```sh
bunx degit colin-m-t/nzbeam-plugins/plugins/<plugin> data/plugins/<plugin>
```

**One file**, for a plugin that is only `plugin.ts`:

```sh
mkdir -p data/plugins/<plugin>
curl -L -o data/plugins/<plugin>/plugin.ts \
  https://raw.githubusercontent.com/colin-m-t/nzbeam-plugins/master/plugins/<plugin>/plugin.ts
```

While this repository is private, all three need a token or collaborator access
(`gh auth login` covers the `gh` and `curl` routes). The same commands work for everyone once it
is public.

### Versions

A plugin's row says which SDK it was built for. A version that is not the app's is a note on the
row, never a refusal: the plugin loads, switches on and runs whatever it says. Releases are kept,
so if a plugin's newest version needs a newer NZBeam than you run, the older zip on the download
page is still there.

## Writing one

The reference is [`docs/PLUGIN_DEV.md`](https://github.com/colin-m-t/nzbeam/blob/master/docs/PLUGIN_DEV.md)
in nzbeam: what a manifest may declare, what every hook is handed, and what the app does with it.
`examples/plugins/sample-cleanup` over there is the worked example to copy.

A plugin here is that, in `plugins/<id>/`, with a `README.md` of its own beside it. The folder's
name is the plugin's id, and the manifest's `id` has to match it.

## Working on this repository

The checkout is the plugins mount: point NZBeam at it and every plugin in here is live in the
development app, off until switched on, reloaded without a restart.

```sh
git clone git@github.com:colin-m-t/nzbeam-plugins.git   # beside your nzbeam checkout
cd nzbeam-plugins
bun install
bun run sdk:sync                                        # fetches sdk/nzbeam-sdk.ts from nzbeam
```

Then in nzbeam's `.env`:

```sh
PLUGINS_DIR=../nzbeam-plugins/plugins
```

Restart the dev container once for the new mount, and after that: edit a plugin, press **Reload
plugins**, see it run.

| Command | What it does |
| --- | --- |
| `bun run sdk:sync` | brings `sdk/nzbeam-sdk.ts` up to date from a sibling nzbeam checkout (`NZBEAM_REPO` for another path, `NZBEAM_REF` to fetch a tag over HTTP once nzbeam is public) |
| `bun run typecheck` | checks every plugin against that file. `bun run typecheck <plugin>` for one |
| `bun run release <plugin> <patch\|minor\|major>` | the whole of a release. `--dry-run` does everything but the commit, tag and push |
| `bun run index` | builds `site/index.json` and the download page locally, as the tag's workflow does |

`sdk/nzbeam-sdk.ts` is the SDK rolled up into one file, with the version in its header. The root
`tsconfig.json` maps `nzbeam/sdk` to it, so the editor has the types with no nzbeam checkout
anywhere.

### Releasing

```sh
bun run release sample-cleanup patch
```

The bump level is the only thing typed by hand. The command bumps the plugin's version, stamps
the SDK major and minor it was tested against, typechecks it, commits what is outstanding in the
plugin's folder, tags `<plugin>@<version>` and pushes. The tag is what does the rest: GitHub
builds the zip, creates the release, and regenerates `index.json` and the download page from
every tag there has ever been.

Releases are tagged off `master`, so merge first. Bump levels are not read out of commit
messages on purpose — conventional commits move that one decision from release time to every
commit, which is more room for mistakes.

### After an SDK change in nzbeam

```sh
bun run sdk:sync
bun run typecheck
```

The typecheck is the list of plugins the change reaches. Fix and release each. Until then they
keep running for users under the version they were built for.

## Layout

| | |
| --- | --- |
| `plugins/<id>/` | one folder per plugin: `plugin.ts` and a `README.md` |
| `sdk/` | the rolled-up SDK file, synced from nzbeam, never edited here |
| `scripts/` | the commands in the table above |
| `.github/workflows/` | typecheck on a pull request, release on a tag |

Only `plugins/` is the mount; everything else is tooling, which is why the plugins sit a folder
down rather than at the root. NZBeam lists any folder in the mount without a `plugin.ts` as a
broken plugin, and `sdk/` beside them would be exactly that.

## Licence

MIT. See [LICENSE](LICENSE).
