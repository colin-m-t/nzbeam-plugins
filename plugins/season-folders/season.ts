/**
 * Reading a season out of a release name.
 *
 * This is the whole of what the plugin has to get right, and the hard part is not what it matches
 * but what it must not: a release name is full of numbers that look like seasons. `1920x1080` is
 * not season 19, `x264` is not season 2, and a year is not anything. So every pattern here is
 * anchored on both sides rather than searched for loosely, and there is a test for each of those.
 */

/** Season and episode together, however the two are joined: `S01E03`, `s01.e03`, `s01 e03`. */
const SEASON_EPISODE = /(?<![a-z0-9])s(\d{1,2})[ ._-]*e\d{1,3}(?![0-9])/i

/**
 * The other way of writing the same: `1x03`. The digit before and after are what keep it off
 * `1920x1080` — a resolution has digits on both sides of the x, an episode does not.
 */
const SEASON_X_EPISODE = /(?<![0-9x])(\d{1,2})x(\d{1,3})(?![0-9])/i

/** Said in words, which is how a folder usually says it: `Season 1`, `season.01`. */
const SEASON_WORD = /(?<![a-z0-9])season[ ._-]?(\d{1,2})(?![0-9])/i

/**
 * A season on its own, with no episode after it: `bla.s01.1080p`, which is how a pack is named.
 * Last of the four, so a name that says both is read as the episode it is.
 */
const SEASON_ALONE = /(?<![a-z0-9])s(\d{1,2})(?![0-9a-z])/i

/**
 * The two that name one episode, as against a season. The difference decides what moves: a folder
 * called `bla.s01e03` is an episode and moves whole, a folder called `bla.s01` is a pack and is
 * opened up so each episode inside it goes to its own season.
 */
const EPISODE_PATTERNS = [SEASON_EPISODE, SEASON_X_EPISODE]

const PATTERNS = [...EPISODE_PATTERNS, SEASON_WORD, SEASON_ALONE]

/**
 * The season `name` says it belongs to, or null when it says nothing. `name` is one file's name or
 * one folder's — never a whole path, since a folder further up may say something different from
 * the file itself and the two are asked separately.
 */
export function seasonOf(name: string): number | null {
  for (const pattern of PATTERNS) {
    const match = pattern.exec(name)
    if (match) return Number(match[1])
  }
  return null
}

/**
 * The season `name` says, but only when it names one *episode* — `bla.s01e03`, `bla - 1x03`. A
 * name that says a season and no episode (`bla.s01`, `Season 2`) is null here: it is a pack, not
 * a thing to move in one piece.
 */
export function episodeOf(name: string): number | null {
  for (const pattern of EPISODE_PATTERNS) {
    const match = pattern.exec(name)
    if (match) return Number(match[1])
  }
  return null
}

/** A folder in the destination that is already a season folder: `s01`, `S1`, `Season 01`. Its whole name, or nothing. */
const SEASON_FOLDER = /^(?:s[ ._-]?(\d{1,2})|season[ ._-]?(\d{1,2}))$/i

/**
 * The season a folder already in the destination holds, or null when it is not a season folder at
 * all. Whole-name only: `S01` is one, `Some.Show.S01E03` is a download that landed there and is
 * not somewhere to put anything.
 */
export function seasonFolderOf(name: string): number | null {
  const match = SEASON_FOLDER.exec(name)
  if (!match) return null
  return Number(match[1] ?? match[2])
}

/** What moves, and where under the season folder it goes. */
export interface Unit {
  season: number
  /** What to keep below the season folder: the file's name, or its folder and everything under it. */
  path: string
}

/**
 * What moves, and to which season.
 *
 * A folder that names one episode is asked first, deepest one wins, and that whole folder is what
 * moves — everything in it, as it was packed. It has to come first: were the file's own name asked
 * before it, `bla.s01e03/bla.s01e03.mkv` would move as the file alone while `bla.s01e03/subs/x.srt`
 * moved as the folder, and one download would both keep and drop the same folder.
 *
 * Only when nothing above it is an episode is the file's own name read, which is what fans a pack
 * of bare files out: `bla.s01/` names a season and no episode, so it is opened up rather than moved.
 *
 * `downloadName` is the last resort, for an obfuscated post: the files in it are named for nothing
 * at all — `2ea3afc4….mkv` — and what the release is called is known only to the download. What
 * moves is then the folder the download would have landed in anyway, so the episode is still named
 * where a library reads it, and this plugin still renames nothing.
 *
 * A file that says nothing, with nothing above it that does and no download name to fall back on,
 * is not this plugin's business.
 */
export function unitFor(file: { name: string, relativePath: string }, downloadName?: string): Unit | null {
  const segments = file.relativePath.split('/')
  // The last segment is the file itself; these are the folders it sits in, deepest first.
  for (let index = segments.length - 2; index >= 0; index--) {
    const season = episodeOf(segments[index]!)
    if (season !== null) return { season, path: segments.slice(index).join('/') }
  }

  const own = seasonOf(file.name)
  if (own !== null) return { season: own, path: file.name }
  if (downloadName === undefined) return null

  // Only when the download brought nothing to go on. A pack says a season somewhere above the file
  // even when it names no episode, and it is already opened up: falling back there would drag its
  // leftovers along behind it, which is exactly what opening it up decided not to do.
  if (segments.some(segment => seasonOf(segment) !== null)) return null

  const said = seasonOf(downloadName)
  return said === null ? null : { season: said, path: `${downloadName}/${file.relativePath}` }
}

/** How a season folder is named when there is not one to reuse. */
export type FolderStyle = 'S01' | 's01' | 'Season 01'

/** `season` written the way `style` writes it, always two digits: 1 is `S01`, not `S1`. */
export function seasonFolderName(season: number, style: FolderStyle): string {
  const digits = String(season).padStart(2, '0')
  if (style === 's01') return `s${digits}`
  if (style === 'Season 01') return `Season ${digits}`
  return `S${digits}`
}
