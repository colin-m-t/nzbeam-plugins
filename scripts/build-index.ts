/**
 * Writes `site/index.json` and the download page beside it: `bun run index`.
 *
 * Both are generated, every time, from the tags — a release is a tag and nothing else — and from
 * the manifests in the checkout, which at any tag on master hold every plugin at the version it
 * was last released under. Nothing on the page is hand-edited, and neither file is committed:
 * GitHub Pages serves what the tag's workflow builds.
 *
 * `index.json` is also what an in-app install would read, so it carries what the app would need
 * to show a plugin and fetch it: id, name, description, version, the SDK pair it was tested
 * against, and the zip.
 */

import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { capture, GITHUB_REPO, listPluginIds, loadManifest, parseTag, SITE_DIR, zipUrl } from './lib'

interface Release {
  version: string
  zip: string
  releasedAt: string
}

interface Entry {
  id: string
  name: string
  description: string
  version: string
  sdkMajor: number
  sdkMinor: number
  zip: string
  releasedAt: string
  releases: Release[]
}

const releasesById = new Map<string, Release[]>()
for (const tag of capture(['git', 'tag', '--list', '*@*']).split('\n').filter(Boolean)) {
  const parsed = parseTag(tag.trim())
  if (!parsed) continue
  const releases = releasesById.get(parsed.id) ?? []
  releases.push({
    version: parsed.version,
    zip: zipUrl(parsed.id, parsed.version),
    releasedAt: capture(['git', 'log', '-1', '--format=%aI', tag.trim()]),
  })
  releasesById.set(parsed.id, releases)
}

const entries: Entry[] = []
for (const id of listPluginIds()) {
  const releases = (releasesById.get(id) ?? []).sort((a, b) => compareVersions(b.version, a.version))
  // A plugin that has never been tagged has nothing to download, so it is not in the catalogue yet.
  if (releases.length === 0) continue
  const manifest = await loadManifest(id)
  const latest = releases[0]!
  entries.push({
    id,
    name: manifest.name,
    description: manifest.description ?? '',
    version: latest.version,
    sdkMajor: manifest.sdkVersion,
    sdkMinor: manifest.sdkMinor ?? 0,
    zip: latest.zip,
    releasedAt: latest.releasedAt,
    releases,
  })
}

const index = {
  generatedAt: new Date().toISOString(),
  repository: GITHUB_REPO,
  plugins: entries,
}

await rm(SITE_DIR, { recursive: true, force: true })
await mkdir(SITE_DIR, { recursive: true })
await Bun.write(join(SITE_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
await Bun.write(join(SITE_DIR, 'index.html'), page(entries))
await Bun.write(join(SITE_DIR, '.nojekyll'), '')

console.log(`site/index.json and site/index.html hold ${entries.length} plugin${entries.length === 1 ? '' : 's'}.`)

/** Newest first, by number rather than by string, so 1.10.0 is above 1.9.0. */
function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]!))
}

function page(plugins: Entry[]): string {
  const cards = plugins.map(plugin => `
      <article class="plugin">
        <header>
          <h2>${escape(plugin.name)}</h2>
          <span class="version">${escape(plugin.version)}</span>
        </header>
        <p class="description">${escape(plugin.description)}</p>
        <p class="sdk">Tested against SDK ${plugin.sdkMajor}.${plugin.sdkMinor}</p>
        <a class="download" href="${escape(plugin.zip)}">Download ${escape(`${plugin.id}-${plugin.version}.zip`)}</a>
        <details>
          <summary>Install</summary>
          <pre><code>cd /path/to/your/plugins/mount
curl -L -o ${escape(plugin.id)}.zip ${escape(plugin.zip)}
unzip ${escape(plugin.id)}.zip &amp;&amp; rm ${escape(plugin.id)}.zip</code></pre>
          <p>Then press <em>Reload plugins</em> under Settings &rarr; Plugins and switch it on.</p>
        </details>
        <details>
          <summary>Older versions</summary>
          <ul>${plugin.releases.map(release => `
            <li><a href="${escape(release.zip)}">${escape(release.version)}</a> <time>${escape(release.releasedAt.slice(0, 10))}</time></li>`).join('')}
          </ul>
        </details>
      </article>`).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NZBeam plugins</title>
<style>
  :root { color-scheme: light dark; --bg: #fff; --fg: #1b1d20; --muted: #6a7078; --line: #e3e6ea; --card: #fff; --accent: #2f6f4f; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14171a; --fg: #e8eaed; --muted: #9aa2ab; --line: #272c31; --card: #191d21; --accent: #7fc9a2; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 3rem 1rem; background: var(--bg); color: var(--fg);
    font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 .35rem; }
  .lede { color: var(--muted); margin: 0 0 2.5rem; }
  .plugin { border: 1px solid var(--line); border-radius: .6rem; background: var(--card); padding: 1.1rem 1.25rem; margin-bottom: 1rem; }
  .plugin header { display: flex; align-items: baseline; gap: .6rem; }
  .plugin h2 { font-size: 1.1rem; margin: 0; }
  .version { color: var(--muted); font-variant-numeric: tabular-nums; font-size: .9rem; }
  .description { margin: .4rem 0 .2rem; }
  .sdk { color: var(--muted); font-size: .85rem; margin: 0 0 .8rem; }
  .download { display: inline-block; color: var(--accent); text-decoration: none; font-weight: 600; }
  .download:hover { text-decoration: underline; }
  details { margin-top: .8rem; }
  summary { cursor: pointer; color: var(--muted); font-size: .9rem; }
  pre { background: rgba(127,127,127,.1); padding: .75rem; border-radius: .4rem; overflow-x: auto; font-size: .85rem; }
  ul { padding-left: 1.2rem; }
  time { color: var(--muted); font-size: .85rem; }
  footer { color: var(--muted); font-size: .85rem; margin-top: 2.5rem; }
  a { color: var(--accent); }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>NZBeam plugins</h1>
  <p class="lede">Drop one into the plugins mount, reload, switch it on.</p>
${plugins.length > 0 ? cards : '  <p class="empty">No plugins have been released yet.</p>'}
  <footer>
    Generated ${new Date().toISOString().slice(0, 10)} from
    <a href="https://github.com/${escape(GITHUB_REPO)}">${escape(GITHUB_REPO)}</a> ·
    <a href="index.json">index.json</a>
  </footer>
</main>
</body>
</html>
`
}
