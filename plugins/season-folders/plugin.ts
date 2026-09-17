import { readdir } from 'node:fs/promises'
import { definePlugin } from 'nzbeam/sdk'
import { seasonFolderName, seasonFolderOf, unitFor, type FolderStyle } from './season'

/**
 * Season folders: puts each episode in the season folder it belongs to, in the category's own
 * folder, instead of leaving it in a folder named after the download.
 *
 * Nothing is renamed and nothing is restructured. The thing that moves is whatever named the
 * episode: the folder it came in when there is one, and the file itself when there is not.
 * Anything that names no season at all is left alone and lands where it always did, which is how
 * a release's nfo and artwork stay together.
 *
 * A folder counts as the thing to move only when it names an episode. One that names a season and
 * no episode is a pack, so it is opened up and its episodes go to their seasons one by one — which
 * is what makes a pack spanning two seasons fall into both with nothing special written for it.
 *
 * An obfuscated post names nothing anywhere: its files come down as `2ea3afc4….mkv` and only the
 * download knows what the release is. That is what the download's own name is for, and the folder
 * it would have landed in is what moves, so the episode is still named where a library reads it.
 */
export default definePlugin({
  id: 'season-folders',
  name: 'Season folders',
  description: 'Puts episodes in the season folder they belong to.',
  version: '0.3.0',

  // The SDK this was written against. `placeAt` arrived in 1.1: on an older app the plugin still
  // loads and its row says so, but the hook has no way to put anything anywhere.
  sdkVersion: 1,
  sdkMinor: 1,

  // What a season folder is called when there is not one to reuse. Per category, since a TV
  // library and a documentaries one may well be laid out by different hands.
  categorySettings: {
    newFolder: {
      type: 'select',
      label: 'New season folders are named',
      hint: 'Only used when the season has no folder yet. One already there is used as it is, whatever its case.',
      options: [
        { value: 'S01', label: 'S01' },
        { value: 's01', label: 's01' },
        { value: 'Season 01', label: 'Season 01' },
      ],
      default: 'S01',
    },
  },

  hooks: {
    async 'download:beforeMove'({ files, destination, download, categorySettings, log, audit }) {
      const style = folderStyle(categorySettings.newFolder)
      // Read once: which seasons already have a folder, and what each is called. The app does no
      // case folding, so asking for `S01` where `s01` sits would make a second folder beside it.
      const folders = await seasonFolders(destination)
      const moved: string[] = []

      for (const file of files) {
        const unit = unitFor(file, download.name)
        if (!unit) continue

        let folder = folders.get(unit.season)
        if (folder === undefined) {
          folder = seasonFolderName(unit.season, style)
          // Remembered, so the rest of a pack goes in beside the first episode of it.
          folders.set(unit.season, folder)
        }

        try {
          const landed = await file.placeAt(`${folder}/${unit.path}`)
          moved.push(`${file.relativePath} -> ${landed}`)
        }
        catch (error) {
          // One file that could not be placed is no reason to strand the rest: it stays where it
          // is and goes to the download's own folder, as it would have without this plugin.
          log(`could not place ${file.relativePath}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (moved.length > 0) {
        log(`placed ${moved.length} file(s): ${moved.join(', ')}`)
        audit('episodes_placed', { files: moved })
      }
    },
  },

  test({ core, categorySettingsFor }) {
    const categories = core.categories.list()
    if (categories.length === 0) return 'No categories yet, so a new season folder would be named S01.'
    const says = categories.map(category => `${category.name}: ${seasonFolderName(1, folderStyle(categorySettingsFor(category.id).newFolder))}`)
    return `Episodes go in the season folder they name. New folders — ${says.join(', ')}.`
  },
})

/** The season folders already in the destination, by the season each holds. A first download finds none. */
async function seasonFolders(destination: string): Promise<Map<number, string>> {
  const folders = new Map<number, string>()
  let entries
  try {
    entries = await readdir(destination, { withFileTypes: true })
  }
  catch {
    // Nothing has ever been put there. `placeAt` makes the folders on the way.
    return folders
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const season = seasonFolderOf(entry.name)
    // The first one wins, so two folders for one season do not make a download pick at random.
    if (season !== null && !folders.has(season)) folders.set(season, entry.name)
  }
  return folders
}

/** The saved setting as one of the shapes, which is what the form allows, and the default otherwise. */
function folderStyle(value: string): FolderStyle {
  return value === 's01' || value === 'Season 01' ? value : 'S01'
}
