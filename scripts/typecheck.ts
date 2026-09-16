/**
 * Typechecks the plugins against the synced SDK: `bun run typecheck [plugin]`.
 *
 * With no plugin named it checks every one of them, which is what CI runs on a pull request and
 * what says, after an SDK major, which plugins the change reaches. With one named it checks only
 * that one, which is what `release` runs before it tags.
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fail, listPluginIds, readSdkVersion, REPO_ROOT, run, runStatus } from './lib'

const TEMP_CONFIG = join(REPO_ROOT, '.tsconfig.plugin.json')

const [id] = process.argv.slice(2)
const sdk = readSdkVersion()
const ids = listPluginIds()

if (id === undefined) {
  console.log(ids.length > 0
    ? `Typechecking ${ids.length} plugin${ids.length === 1 ? '' : 's'} against SDK ${sdk.major}.${sdk.minor}: ${ids.join(', ')}`
    : `No plugins yet; checking the tooling against SDK ${sdk.major}.${sdk.minor}.`)
  run(['bunx', 'tsc', '-p', 'tsconfig.json'])
}
else {
  if (!ids.includes(id)) fail(`No plugin called ${id}. There is: ${ids.join(', ') || 'nothing yet'}.`)
  console.log(`Typechecking ${id} against SDK ${sdk.major}.${sdk.minor}.`)
  // The root config with its include narrowed to the one plugin. It is written beside the root
  // config so that the `paths` mapping it inherits still resolves.
  await Bun.write(TEMP_CONFIG, `${JSON.stringify({
    extends: './tsconfig.json',
    include: ['sdk/nzbeam-sdk.ts', `plugins/${id}/**/*.ts`],
  }, null, 2)}\n`)
  const status = runStatus(['bunx', 'tsc', '-p', TEMP_CONFIG])
  await rm(TEMP_CONFIG, { force: true })
  if (status !== 0) fail(`${id} does not typecheck against SDK ${sdk.major}.${sdk.minor}.`)
}

console.log(`Typecheck passed${id === undefined ? '' : ` for ${id}`}.`)
