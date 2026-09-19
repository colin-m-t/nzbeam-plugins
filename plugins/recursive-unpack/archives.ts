/**
 * Which files are archives, which of them belong to the same one, and what opens each kind.
 *
 * This is the whole of what the plugin has to get right, and the hard part is the sets. An archive
 * is rarely one file: a rar arrives as `bla.part01.rar`, `bla.part02.rar`, or as `bla.rar` with
 * `bla.r00` behind it, and pointing the unpacker at the wrong piece of one gets either nothing or
 * the same content twice. So the pieces are gathered into sets by what they share, each set names
 * the one piece to point at, and the rest are carried along only so they can be cleared away
 * together once the set has been opened.
 */

/** The kinds this plugin knows how to open. Anything else is left where it is. */
export type ArchiveKind = 'rar' | 'zip' | '7z'

// --- Reading a name

/** `bla.part01.rar` — how a rar set is split these days. The number decides which piece is first. */
const RAR_PART = /\.part(\d+)\.rar$/i
/** `bla.r00`, `bla.s01` — the volumes behind a set whose first piece is a plain `.rar`. */
const RAR_OLD_VOLUME = /\.([rs])(\d{2,3})$/i
/** `bla.zip` and `bla.z01` — a split zip, whose `.zip` is the piece to point at. */
const ZIP_VOLUME = /\.z(\d{2,3})$/i
/** `bla.7z.001` — how 7z splits, the first volume included in the numbering. */
const SEVEN_VOLUME = /\.7z\.(\d{3,})$/i

/** One file, read as a piece of some archive. */
interface Piece {
  name: string
  kind: ArchiveKind
  /** What every piece of the same archive shares, which is what they are gathered by. */
  base: string
  /** Where it comes in the set. The lowest piece that can be pointed at is the one that is. */
  order: number
  /** Whether an unpacker can be pointed at this piece at all. A middle volume cannot. */
  leads: boolean
}

/**
 * What `name` is a piece of, or null when it is not a piece of anything this plugin opens. Read
 * from the name alone: nothing here opens a file to find out, since a set has to be recognised
 * before any of it is touched.
 */
export function pieceOf(name: string): Piece | null {
  const part = RAR_PART.exec(name)
  if (part) return { name, kind: 'rar', base: name.slice(0, part.index), order: Number(part[1]), leads: true }

  const old = RAR_OLD_VOLUME.exec(name)
  // `r` before `s`, both after the `.rar` that leads them, which is all the order has to say.
  if (old) return { name, kind: 'rar', base: name.slice(0, old.index), order: (old[1]!.toLowerCase() === 'r' ? 1000 : 2000) + Number(old[2]), leads: false }

  const seven = SEVEN_VOLUME.exec(name)
  if (seven) return { name, kind: '7z', base: name.slice(0, seven.index), order: Number(seven[1]), leads: Number(seven[1]) === 1 }

  const zipVolume = ZIP_VOLUME.exec(name)
  if (zipVolume) return { name, kind: 'zip', base: name.slice(0, zipVolume.index), order: Number(zipVolume[1]), leads: false }

  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (!name.includes('.')) return null
  const base = name.slice(0, name.length - extension.length - 1)
  // The plain ones, each the first piece of its set whether or not anything follows it.
  if (extension === 'rar') return { name, kind: 'rar', base, order: 0, leads: true }
  if (extension === 'zip') return { name, kind: 'zip', base, order: 0, leads: true }
  if (extension === '7z') return { name, kind: '7z', base, order: 0, leads: true }
  return null
}

/** One archive: the piece to point an unpacker at, and every file that goes with it. */
export interface ArchiveSet {
  kind: ArchiveKind
  /** The piece to open. */
  first: string
  /** What every piece of it shares, without the extension: what a folder for it is named after. */
  base: string
  /** Every piece of the set, `first` included, in the order they come. Cleared away together. */
  volumes: string[]
}

/**
 * The archives among `names`, one set each, in a settled order so the same folder always comes out
 * the same way. Names that belong to no set are skipped, and so is a set with no piece that can be
 * pointed at — a folder holding `bla.r00` and nothing else is half an archive, and half an archive
 * is left alone rather than opened into something incomplete.
 */
export function archiveSets(names: readonly string[]): ArchiveSet[] {
  const groups = new Map<string, Piece[]>()
  for (const name of names) {
    const piece = pieceOf(name)
    if (!piece) continue
    // Case-folded, since a set is often posted with its volumes cased differently from its first.
    const key = `${piece.kind}\0${piece.base.toLowerCase()}`
    const group = groups.get(key)
    if (group) group.push(piece)
    else groups.set(key, [piece])
  }

  const sets: ArchiveSet[] = []
  for (const group of groups.values()) {
    group.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    const first = group.find(piece => piece.leads)
    if (!first) continue
    sets.push({ kind: first.kind, first: first.name, base: first.base, volumes: group.map(piece => piece.name) })
  }
  return sets.sort((a, b) => a.first.localeCompare(b.first))
}

// --- What opens each kind

export interface Unpacker {
  program: string
  /**
   * Everything after the program's name. Flat into `into`, overwriting nothing that is already
   * there, and never stopping to ask for a password: there is nobody at the other end to answer.
   */
  args(archive: string, into: string): string[]
}

/**
 * Flat on purpose, into whatever folder the caller names. The archive's own folders are given up
 * because an unpacker that keeps them lays them out differently from one another, and what comes
 * out has to be somewhere the app will find it either way.
 *
 * Where that folder is, is the caller's: beside the archive when it is the only one being opened
 * there, and a folder of its own when it is not, so four albums in four archives do not come out
 * as one heap of songs.
 */
const unrar: Unpacker = {
  program: 'unrar',
  // -or rename rather than overwrite, -y yes to everything, -idc no banner, -p- never ask.
  args: (archive, into) => ['e', '-or', '-y', '-idc', '-p-', '--', archive, `${into}/`],
}

/** p7zip under each of the names it is installed as. `-aou` renames rather than overwrites, `-p` answers the password prompt with nothing. */
const sevenZip = (program: string): Unpacker => ({
  program,
  args: (archive, into) => ['e', '-y', '-aou', '-p', `-o${into}`, '--', archive],
})

const unzip: Unpacker = {
  program: 'unzip',
  // -j flat, -qq quiet, -o overwrite, -P '' fail rather than ask. `./` so a name cannot read as a switch.
  args: (archive, into) => ['-j', '-qq', '-o', '-P', '', `./${archive}`, '-d', into],
}

const SEVEN_ZIP = ['7z', '7za', '7zz'].map(sevenZip)

/**
 * What to try for each kind, in order, until one of them is installed. NZBeam's image carries
 * unrar and p7zip, so all three kinds work as they stand; the names beside them are for an image
 * that was built before p7zip was added to it, or one somebody else put together.
 */
export const UNPACKERS: Record<ArchiveKind, readonly Unpacker[]> = {
  rar: [unrar, ...SEVEN_ZIP],
  zip: [...SEVEN_ZIP, unzip],
  '7z': SEVEN_ZIP,
}
