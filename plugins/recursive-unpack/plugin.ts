import type { Dirent } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { definePlugin } from 'nzbeam/sdk'
import { archiveSets, UNPACKERS, type ArchiveSet } from './archives'

/**
 * Recursive unpack: opens the archives that come out of an archive.
 *
 * NZBeam unpacks what the post brought down and stops there, which is right nearly every time.
 * The exception is the post that was packed twice — a rar holding a rar, a rar holding a zip —
 * where stopping there puts an archive in the library instead of a film. This carries on from
 * where the app left off: whatever it is about to move that is still an archive is opened where it
 * stands, and whatever comes out of that is looked at again, down to the depth on its page.
 *
 * What it will not do is open the download's own archives a second time. The folder they came down
 * in still holds them once the app has unpacked them, so the first round goes by the files the app
 * says it is about to move rather than by what is on disk, and every round after it by what the
 * round before it actually wrote. An archive that is opened and an archive that has already been
 * opened look exactly alike from here, and the difference matters enough to be read rather than
 * guessed at.
 *
 * Nothing here fails a download. An archive that cannot be opened — a program the image does not
 * carry, a volume that never arrived, a password nobody has — is left where it is and said so in
 * the log, and the download lands as it would have without this plugin.
 */
export default definePlugin({
  id: 'recursive-unpack',
  name: 'Recursive unpack',
  description: 'Opens the archives that come out of an archive, as deep as they go.',
  version: '0.2.0',

  // The SDK this was written against, written down rather than read from anywhere: it is what the
  // plugin claims, not what it happens to be running on.
  sdkVersion: 1,
  sdkMinor: 1,

  settings: {
    depth: {
      type: 'number',
      label: 'How many archives deep to go',
      hint: 'Counted from the first archive found inside what the app unpacked. Three is deeper than anything posted in practice; the limit is here so a pair of archives holding each other cannot go round for ever.',
      default: 3,
      min: 1,
      max: 10,
      integer: true,
    },
  },

  hooks: {
    async 'download:beforeMove'({ files, download, settings, run, signal, log, audit }) {
      const opened: string[] = []
      const left: string[] = []
      /** Every archive already looked at, so one that writes a copy of itself is not opened twice. */
      const seen = new Set<string>()

      /** One archive, into the folder it sits in. Null when it is open, otherwise why it is not. */
      const unpack = async (folder: string, set: ArchiveSet): Promise<string | null> => {
        let lastly = ''
        for (const unpacker of UNPACKERS[set.kind]) {
          let result
          try {
            result = await run([unpacker.program, ...unpacker.args(set.first, folder)], { cwd: folder })
          }
          catch (error) {
            // Nearly always the program is not in the image. Whatever it was, the next one may do.
            lastly = error instanceof Error ? error.message : String(error)
            continue
          }
          // 1 is a warning the program still finished with, which is how the app reads unrar too.
          if (result.code <= 1) return null
          const said = result.stderr.trim().split('\n').map(line => line.trim()).filter(Boolean).pop()
          return `${unpacker.program} exited with ${result.code}${said ? `: ${said}` : ''}`
        }
        return lastly || `nothing in this image opens a ${set.kind}`
      }

      // The first round is what the app listed, and only that: the files it is about to move.
      let pending = byFolder(files.map(file => file.path))

      for (let depth = 1; depth <= settings.depth && pending.size > 0; depth++) {
        const next = new Map<string, string[]>()

        for (const [folder, names] of pending) {
          for (const set of archiveSets(names)) {
            if (signal.aborted) return
            const archive = join(folder, set.first)
            if (seen.has(archive)) continue
            seen.add(archive)

            // What was there before, so that what the unpacker wrote can be told from what was
            // already beside it — which is the next round, and nothing else is.
            const before = new Set((await entriesIn(folder)).map(entry => entry.name))
            const why = await unpack(folder, set)
            if (why) {
              log(`left ${set.first} alone: ${why}`)
              left.push(set.first)
              continue
            }

            const fresh = (await entriesIn(folder)).filter(entry => !before.has(entry.name))
            // Only once it is open, so a set that could not be read is still there to try by hand.
            for (const volume of set.volumes) await rm(join(folder, volume), { force: true })
            // 7z lays the files out flat as it is asked to and still makes the folders they were
            // in, which would otherwise be moved into the library empty.
            for (const entry of fresh) if (entry.isDirectory()) await pruneEmpty(join(folder, entry.name))

            opened.push(set.first)
            const made = fresh.filter(entry => entry.isFile()).map(entry => entry.name)
            if (made.length > 0) next.set(folder, [...next.get(folder) ?? [], ...made])
          }
        }

        pending = next
      }

      if (opened.length > 0) {
        log(`opened ${opened.length} nested archive(s): ${opened.join(', ')}`)
        audit('archives_unpacked', { download: download.name, archives: opened, left })
      }
    },
  },

  test({ settings }) {
    return `Archives found inside what the app unpacked are opened too, ${settings.depth} deep — rar with unrar, zip and 7z with p7zip, both of which NZBeam's image carries.`
  },
})

/** The names in each folder, gathered by the folder they are in. */
function byFolder(paths: readonly string[]): Map<string, string[]> {
  const folders = new Map<string, string[]>()
  for (const path of paths) {
    const folder = dirname(path)
    const names = folders.get(folder)
    if (names) names.push(basename(path))
    else folders.set(folder, [basename(path)])
  }
  return folders
}

/** What is in `folder`; nothing when there is no such folder. */
async function entriesIn(folder: string): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true })
  }
  catch {
    return []
  }
}

/**
 * Takes away a folder the unpacker made and put nothing in, deepest first, and says whether it
 * went. One that holds something is left exactly as it is.
 */
async function pruneEmpty(folder: string): Promise<boolean> {
  const entries = await entriesIn(folder)
  let empty = true
  for (const entry of entries) {
    if (entry.isDirectory() && await pruneEmpty(join(folder, entry.name))) continue
    empty = false
  }
  if (empty) await rm(folder, { recursive: true, force: true })
  return empty
}
