/**
 * What every script in here needs: where things are, which plugins exist, what the synced SDK
 * file says its version is, and how to run a command.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AnyPluginDefinition } from 'nzbeam/sdk'

export const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
export const PLUGINS_DIR = join(REPO_ROOT, 'plugins')
export const SDK_ROLLUP = join(REPO_ROOT, 'sdk', 'nzbeam-sdk.ts')
export const SITE_DIR = join(REPO_ROOT, 'site')

/** The same rule the app holds a plugin folder's name to. */
export const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

/** The entry file the app looks for, in the order it looks. */
export const PLUGIN_ENTRY_FILES = ['plugin.ts', 'plugin.js'] as const

export interface SdkVersion {
  major: number
  minor: number
}

/** The repository a release's zip is downloaded from. */
export const GITHUB_REPO = process.env.GITHUB_REPOSITORY ?? 'colin-m-t/nzbeam-plugins'

/** A release is a tag, and the tag is the whole of what names it. */
export function tagName(id: string, version: string): string {
  return `${id}@${version}`
}

export function parseTag(tag: string): { id: string, version: string } | null {
  const found = tag.match(/^([a-z0-9][a-z0-9_-]*)@(\d+\.\d+\.\d+)$/)
  return found ? { id: found[1]!, version: found[2]! } : null
}

/** Newest first: `1.10.0` is above `1.9.0`, which string order gets backwards. */
function byVersion(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let part = 0; part < 3; part++) {
    if (left[part] !== right[part]) return right[part]! - left[part]!
  }
  return 0
}

/**
 * The newest version of `id` that has actually been released, read off the tags, or null when it
 * has never been released.
 *
 * The tags are the record of what was published, and a manifest is only ever meant to agree with
 * them: the release script is the one thing that moves a version, and it moves the manifest and
 * the tag together. Anything that reads them apart is somebody having typed a version by hand.
 *
 * Needs the tags to be in the checkout — `actions/checkout` fetches none by default.
 */
export function releasedVersion(id: string): string | null {
  const tags = capture(['git', 'tag', '--list', `${id}@*`]).split('\n').map(line => line.trim()).filter(Boolean)
  const versions = tags.flatMap((tag) => {
    const parsed = parseTag(tag)
    return parsed && parsed.id === id ? [parsed.version] : []
  })
  return versions.sort(byVersion)[0] ?? null
}

/** What the tag's workflow attaches to the release, and what the index points at. */
export function zipName(id: string, version: string): string {
  return `${id}-${version}.zip`
}

export function zipUrl(id: string, version: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/download/${tagName(id, version)}/${zipName(id, version)}`
}

/** Says what went wrong and stops. */
export function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/**
 * The version the synced SDK file carries, read from the line `sdk:build` writes into its header.
 * That line is the only place the pair is written down, here or in nzbeam's rollup.
 */
export function readSdkVersion(): SdkVersion {
  if (!existsSync(SDK_ROLLUP)) fail('No sdk/nzbeam-sdk.ts. Run `bun run sdk:sync` first.')
  return sdkVersionOf(readFileSync(SDK_ROLLUP, 'utf8'))
}

/** The same read, for a file that is only in memory — what `sdk:sync` has just fetched. */
export function sdkVersionOf(text: string): SdkVersion {
  const found = text.match(/The NZBeam plugin SDK, version (\d+)\.(\d+)\./)
  if (!found) fail('That does not read as an NZBeam SDK file: no version in its header.')
  return { major: Number(found[1]), minor: Number(found[2]) }
}

/** The plugin folders in the repository, by id, in the order the app would list them. */
export function listPluginIds(): string[] {
  if (!existsSync(PLUGINS_DIR)) return []
  return readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

export function pluginDir(id: string): string {
  return join(PLUGINS_DIR, id)
}

/** The plugin's entry file, or nothing when the folder holds neither name. */
export function pluginEntry(id: string): string | null {
  for (const candidate of PLUGIN_ENTRY_FILES) {
    const path = join(pluginDir(id), candidate)
    if (existsSync(path)) return path
  }
  return null
}

/**
 * The plugin's manifest, by importing it exactly as the app does: `definePlugin` hands the object
 * back, so what is read here is what the app would load. The query keeps a second import in one
 * run from coming out of the module cache.
 */
export async function loadManifest(id: string): Promise<AnyPluginDefinition> {
  const entry = pluginEntry(id)
  if (!entry) fail(`plugins/${id} holds no ${PLUGIN_ENTRY_FILES.join(' or ')}.`)
  const module = await import(`${entry}?t=${Date.now()}`) as { default?: AnyPluginDefinition }
  if (!module.default) fail(`plugins/${id} has no default export.`)
  return module.default
}

/** Runs a command, shows its output as it goes, and stops the script when it fails. */
export function run(command: string[], options: { cwd?: string } = {}): void {
  if (runStatus(command, options) !== 0) fail(`\`${command.join(' ')}\` failed.`)
}

/** The same, but the caller decides what a failure means — there may be something to tidy first. */
export function runStatus(command: string[], options: { cwd?: string } = {}): number {
  const result = Bun.spawnSync(command, { cwd: options.cwd ?? REPO_ROOT, stdout: 'inherit', stderr: 'inherit' })
  return result.exitCode ?? 1
}

/** Runs a command and hands back what it printed. */
export function capture(command: string[], options: { cwd?: string } = {}): string {
  const result = Bun.spawnSync(command, { cwd: options.cwd ?? REPO_ROOT, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) fail(`\`${command.join(' ')}\` failed: ${result.stderr.toString().trim()}`)
  return result.stdout.toString().trim()
}

/** Runs a command and says only whether it worked. */
export function tryRun(command: string[], options: { cwd?: string } = {}): boolean {
  const result = Bun.spawnSync(command, { cwd: options.cwd ?? REPO_ROOT, stdout: 'pipe', stderr: 'pipe' })
  return result.exitCode === 0
}
