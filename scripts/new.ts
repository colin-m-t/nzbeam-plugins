/**
 * Starts a plugin: `bun run new <id> ["What it does"]`.
 *
 * Writes `plugins/<id>/plugin.ts` and a `README.md` beside it — a manifest with one setting and
 * one hook, which loads and runs as it stands. If the repository is your plugins mount it is on
 * the Plugins page the moment you press "Reload plugins", off until you switch it on.
 *
 * It is a starting point, not a template to fill in: delete what you do not need. Everything a
 * plugin may declare is in the plugin reference, and plugins/sample-cleanup is a fuller one.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fail, PLUGIN_ID_PATTERN, pluginDir, readSdkVersion } from './lib'

const [id, description] = process.argv.slice(2)

if (!id) fail('Usage: bun run new <id> ["What it does"]')
if (!PLUGIN_ID_PATTERN.test(id)) {
  fail(`"${id}" cannot be a plugin id: lower case, digits, dashes and underscores, starting with a letter or digit.\nIt is the folder's name and the app holds it to that.`)
}
if (existsSync(pluginDir(id))) fail(`plugins/${id} is already there.`)

const sdk = readSdkVersion()
const name = id.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
const says = description ?? `${name} does something useful.`

// The manifest's head, with its comments lined up however long the name turns out to be.
const head: [string, string][] = [
  [`id: '${id}',`, 'the folder\'s name'],
  [`name: '${name}',`, 'shown on the Plugins page'],
  [`description: '${says.replace(/'/g, '\\\'')}',`, ''],
  ['version: \'0.1.0\',', 'your own, bumped by `bun run release`'],
  [`sdkVersion: ${sdk.major},`, 'the SDK this was written against, as a literal'],
  [`sdkMinor: ${sdk.minor},`, 'and the minor beside it. Both stamped by `bun run release`'],
]
const column = Math.max(...head.map(([code]) => code.length)) + 2
const manifestHead = head
  .map(([code, comment]) => `  ${comment ? `${code.padEnd(column)}// ${comment}` : code}`)
  .join('\n')

await Bun.write(join(pluginDir(id), 'plugin.ts'), `import { definePlugin } from 'nzbeam/sdk'

/**
 * ${says}
 */
export default definePlugin({
${manifestHead}

  // The form on the plugin's page. Every value is handed to the hooks below as \`ctx.settings\`,
  // typed from what is written here. Delete this if the plugin has nothing to ask for.
  settings: {
    note: {
      type: 'string',
      label: 'A word to log',
      hint: 'Here to show what a setting looks like. Take it out.',
      default: 'hello',
    },
  },

  hooks: {
    // Runs once a download is unpacked and before anything is moved into place, so this is where
    // to look at, delete or rename what is about to land. Return { fail: 'reason' } to stop it.
    async 'download:beforeMove'({ download, files, settings, log }) {
      log(\`\${settings.note}: \${download.name} is about to move \${files.length} file(s)\`)
    },
  },

  // Behind the Test button on the plugin's page. Return a word for the page, or throw.
  test() {
    return 'Ready.'
  },
})
`)

await Bun.write(join(pluginDir(id), 'README.md'), `# ${name}

${says}

## Settings

| | |
| --- | --- |
| A word to log | replace this table with what your plugin actually asks for |

## What it does

Say what it hooks into and when it runs, so somebody installing it knows what they are switching
on.
`)

console.log(`plugins/${id} is ready — written against SDK ${sdk.major}.${sdk.minor}.

  1. Edit plugins/${id}/plugin.ts. The reference is docs/PLUGIN_DEV.md in nzbeam, and
     plugins/sample-cleanup is a fuller example.
  2. Press "Reload plugins" under Settings → Plugins, then switch it on.
  3. bun run typecheck ${id}
`)
