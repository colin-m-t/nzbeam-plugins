/**
 * Releases one plugin: `bun run release <plugin> <patch|minor|major>`.
 *
 * The bump level is the only thing a person types. Everything else is read or computed: the new
 * version from the old one, the SDK pair from the synced file, the tag from the two of them. It
 * then typechecks, commits whatever is outstanding in the plugin's folder along with the bump,
 * tags and pushes — and the tag is what makes GitHub build the zip, the release, the index and
 * the download page.
 *
 *   bun run release sample-cleanup patch
 *   bun run release sample-cleanup minor --dry-run   # everything but the commit, tag and push
 *
 * Bump levels are not read out of commit messages on purpose: conventional commits move the
 * discipline from one word at release time to every commit, which is more room for mistakes.
 */

import { capture, fail, listPluginIds, loadManifest, PLUGIN_ID_PATTERN, pluginEntry, readSdkVersion, run, tagName, tryRun } from './lib'

const LEVELS = ['patch', 'minor', 'major'] as const
type Level = typeof LEVELS[number]

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [id, level] = args.filter(argument => !argument.startsWith('--'))

if (!id || !level) fail('Usage: bun run release <plugin> <patch|minor|major> [--dry-run]')
if (!LEVELS.includes(level as Level)) fail(`The bump level is one of ${LEVELS.join(', ')}, not "${level}".`)
if (!listPluginIds().includes(id)) fail(`No plugin called ${id}. There is: ${listPluginIds().join(', ') || 'nothing yet'}.`)
// The folder's name is the id, and the app holds it to this before it will load anything.
if (!PLUGIN_ID_PATTERN.test(id)) fail(`"${id}" is not a plugin id: lower case, digits, dashes and underscores.`)

const entry = pluginEntry(id)
if (!entry) fail(`plugins/${id} holds no plugin.ts.`)

// --- What the repository has to look like first

// A dry run publishes nothing, so none of this is its business.
const branch = capture(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
if (!dryRun) {
  if (branch !== 'master') fail(`Releases are tagged off master, and this is ${branch}. Merge it first.`)

  const dirty = capture(['git', 'status', '--porcelain'])
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => line.slice(3))
    .filter(path => !path.startsWith(`plugins/${id}/`))
  if (dirty.length > 0) {
    fail(`The tree holds changes outside plugins/${id}, which a release would sweep up:\n  ${dirty.join('\n  ')}`)
  }

  run(['git', 'fetch', 'origin', branch, '--quiet'])
  const behind = capture(['git', 'rev-list', '--count', `HEAD..origin/${branch}`])
  if (behind !== '0') fail(`${branch} is ${behind} commit(s) behind origin. Pull first.`)
}

// --- The numbers

const manifest = await loadManifest(id)
if (manifest.id !== id) fail(`plugins/${id} calls itself "${manifest.id}". The folder's name is the id.`)

const version = bump(manifest.version, level as Level)
const tag = tagName(id, version)
if (tryRun(['git', 'rev-parse', '--verify', '--quiet', `refs/tags/${tag}`])) fail(`${tag} already exists.`)

const sdk = readSdkVersion()

// --- Stamping them into the manifest

const before = await Bun.file(entry).text()
const after = stamp(before, version, sdk.major, sdk.minor)
await Bun.write(entry, after)

const written = await loadManifest(id)
if (written.version !== version || written.sdkVersion !== sdk.major || (written.sdkMinor ?? 0) !== sdk.minor) {
  await Bun.write(entry, before)
  fail(`Could not stamp the version into ${entry}: it reads as ${written.version} / SDK ${written.sdkVersion}.${written.sdkMinor ?? 0} afterwards. Nothing was changed.`)
}

console.log(`${id} ${manifest.version} → ${version}, tested against SDK ${sdk.major}.${sdk.minor}.`)

// --- The check that has to pass before any of it is published

run(['bun', 'run', 'scripts/typecheck.ts', id])

if (dryRun) {
  await Bun.write(entry, before)
  console.log(`Dry run: ${entry} put back, nothing committed, ${tag} not made.`)
  process.exit(0)
}

// --- Publishing it

run(['git', 'add', `plugins/${id}`])
run(['git', 'commit', '-m', `${id} ${version}`])
run(['git', 'tag', '-a', tag, '-m', `${manifest.name} ${version} (SDK ${sdk.major}.${sdk.minor})`])
run(['git', 'push', 'origin', branch])
run(['git', 'push', 'origin', tag])

console.log(`Pushed ${tag}. GitHub builds the zip, the release, index.json and the page from here.`)

/** The next version, which is the only place a version number is ever worked out. */
function bump(current: string, level: Level): string {
  const parts = current.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!parts) fail(`${id}'s version reads "${current}", which is not major.minor.patch.`)
  const [major, minor, patch] = parts.slice(1).map(Number) as [number, number, number]
  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/**
 * Writes the three numbers into the manifest's own source. Only the first of each is touched,
 * which is the manifest's; what the check above is for is the case where that guess is wrong.
 */
function stamp(source: string, version: string, major: number, minor: number): string {
  let text = source.replace(/(\bversion:\s*)(['"])(\d+\.\d+\.\d+)\2/, `$1$2${version}$2`)
  text = text.replace(/(\bsdkVersion:\s*)\d+/, `$1${major}`)
  if (/\bsdkMinor:\s*\d+/.test(text)) {
    text = text.replace(/(\bsdkMinor:\s*)\d+/, `$1${minor}`)
  }
  else {
    // No sdkMinor yet: it goes on the line under sdkVersion, indented as that line is.
    text = text.replace(/^(\s*)(sdkVersion:\s*\d+,?.*)$/m, `$1$2\n$1sdkMinor: ${minor},`)
  }
  return text
}
