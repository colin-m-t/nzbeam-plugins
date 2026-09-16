/**
 * Builds the zip a release hands out, and the notes that go with it: `bun run scripts/pack.ts <tag>`.
 *
 * Run by the tag's workflow, which then attaches what this writes to the GitHub release. The zip
 * holds the plugin's folder, not its contents, so unzipping it in the plugins mount puts the
 * plugin where the app looks for it.
 *
 * Whatever the workflow needs afterwards is appended to `$GITHUB_OUTPUT`: `id`, `version`, `zip`,
 * `notes` and `title`.
 */

import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fail, loadManifest, parseTag, pluginEntry, PLUGINS_DIR, REPO_ROOT, run, zipName } from './lib'

const DIST = join(REPO_ROOT, 'dist')

const [tag] = process.argv.slice(2)
if (!tag) fail('Usage: bun run scripts/pack.ts <plugin>@<version>')

const parsed = parseTag(tag)
if (!parsed) fail(`"${tag}" is not a release tag: they read <plugin>@<major>.<minor>.<patch>.`)
const { id, version } = parsed

if (!pluginEntry(id)) fail(`${tag} names a plugin this commit does not hold: there is no plugins/${id}/plugin.ts.`)

const manifest = await loadManifest(id)
if (manifest.version !== version) {
  fail(`${tag} does not match what it points at: plugins/${id} reads as ${manifest.version}. The tag is made by \`bun run release\`, which keeps the two in step.`)
}

await rm(DIST, { recursive: true, force: true })
await mkdir(DIST, { recursive: true })

const zip = join(DIST, zipName(id, version))
// A plugin's tests are this repository's business, not something to unzip into somebody's mount.
run(['zip', '-r', '-q', zip, id, '-x', '*.test.ts'], { cwd: PLUGINS_DIR })

const sdk = `${manifest.sdkVersion}.${manifest.sdkMinor ?? 0}`
const notes = join(DIST, 'notes.md')
await Bun.write(notes, `${[
  manifest.description ?? '',
  '',
  `Tested against NZBeam SDK ${sdk}. A plugin built for another version still loads and runs; the difference shows on its row.`,
  '',
  '## Install',
  '',
  '```sh',
  'cd /path/to/your/plugins/mount',
  `curl -L -o ${id}.zip https://github.com/${process.env.GITHUB_REPOSITORY ?? 'colin-m-t/nzbeam-plugins'}/releases/download/${tag}/${zipName(id, version)}`,
  `unzip ${id}.zip && rm ${id}.zip`,
  '```',
  '',
  'Then press "Reload plugins" under Settings → Plugins and switch it on.',
].join('\n')}\n`)

const output = process.env.GITHUB_OUTPUT
if (output) {
  await Bun.write(output, `${await Bun.file(output).text().catch(() => '')}${[
    `id=${id}`,
    `version=${version}`,
    `zip=${zip}`,
    `notes=${notes}`,
    `title=${manifest.name} ${version}`,
  ].join('\n')}\n`)
}

console.log(`Packed ${zipName(id, version)} (SDK ${sdk}).`)
