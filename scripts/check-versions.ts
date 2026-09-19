/**
 * Checks that no plugin's version has been typed by hand: `bun run check:versions`.
 *
 * A version is not source. `bun run release` is the one thing that moves one — it stamps the
 * manifest, commits, and tags, all together — so on any branch a manifest should read exactly what
 * that plugin's newest tag says. A manifest that has run ahead of its tags means somebody edited
 * the number themselves, and that is worth catching in the pull request rather than at release
 * time, where it comes out as a version silently skipped: bump a hand-written 0.3.0 by a minor and
 * what gets published is 0.4.0, with no 0.3.0 that ever existed.
 *
 * A plugin with no tags at all has never been released and is left alone; its first release sets
 * the number.
 *
 * Needs the tags in the checkout, which `actions/checkout` does not fetch by default.
 */

import { fail, listPluginIds, loadManifest, releasedVersion } from './lib'

const wrong: string[] = []

for (const id of listPluginIds()) {
  const released = releasedVersion(id)
  if (released === null) {
    console.log(`${id}: never released, nothing to check against.`)
    continue
  }

  const { version } = await loadManifest(id)
  if (version === released) {
    console.log(`${id}: ${version}, which is what ${id}@${released} published.`)
    continue
  }
  wrong.push(
    `${id}: the manifest says ${version} but the newest release is ${released}.\n`
    + `    Put plugins/${id}/plugin.ts back to ${released} and let the release set the number:\n`
    + `      bun run release ${id} <patch|minor|major>`,
  )
}

if (wrong.length > 0) {
  fail(`A version has been written by hand. The release script owns version numbers:\n\n  ${wrong.join('\n\n  ')}`)
}

console.log('Every version matches what was released.')
