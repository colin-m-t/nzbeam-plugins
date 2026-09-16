import { describe, expect, test } from 'bun:test'
import { episodeOf, seasonFolderName, seasonFolderOf, seasonOf, unitFor } from './season'

/** A download's file as the hook is handed it: the two fields the rule reads. */
const file = (relativePath: string) => ({ name: relativePath.split('/').pop()!, relativePath })

describe('the season a name says it is', () => {
  test('reads a season and episode, however the two are joined', () => {
    expect(seasonOf('bla.s01e03.mkv')).toBe(1)
    expect(seasonOf('Bla.S01E03.1080p.WEB-DL.x264-GROUP.mkv')).toBe(1)
    expect(seasonOf('bla.s01.e03.mkv')).toBe(1)
    expect(seasonOf('bla.s01 e03.mkv')).toBe(1)
    expect(seasonOf('bla.s01-e03.mkv')).toBe(1)
    expect(seasonOf('Bla S12E101.mkv')).toBe(12)
    expect(seasonOf('bla.s00e01.mkv')).toBe(0)
  })

  test('reads the other way of writing it', () => {
    expect(seasonOf('Bla - 1x03 - Pilot.mkv')).toBe(1)
    expect(seasonOf('bla.12x101.mkv')).toBe(12)
  })

  test('reads a season said in words', () => {
    expect(seasonOf('Bla Season 2')).toBe(2)
    expect(seasonOf('bla.season.02.1080p')).toBe(2)
    expect(seasonOf('bla season2')).toBe(2)
  })

  test('reads a season on its own, which is how a pack is named', () => {
    expect(seasonOf('bla.s01.1080p.WEB-DL')).toBe(1)
    expect(seasonOf('Bla.S02.COMPLETE')).toBe(2)
  })

  test('prefers the episode when a name says both', () => {
    // The folder says the pack is season 1; the file says which episode of it. Same answer here,
    // but the episode pattern is the one that has to win when they differ.
    expect(seasonOf('bla.s01.complete.s02e04.mkv')).toBe(2)
  })

  test('does not mistake a resolution, a codec or a year for a season', () => {
    // The ones that would land a library in S19 or S02 if the patterns were loose.
    expect(seasonOf('Bla.1920x1080.mkv')).toBeNull()
    expect(seasonOf('Bla.1080p.x264-GROUP.mkv')).toBeNull()
    expect(seasonOf('Bla.2160p.x265.HDR.mkv')).toBeNull()
    expect(seasonOf('Bla.H.265.DDP5.1.mkv')).toBeNull()
    expect(seasonOf('Bla.2024.1080p.mkv')).toBeNull()
    expect(seasonOf('Bla.720x480.avi')).toBeNull()
  })

  test('does not read a season out of the middle of a word', () => {
    expect(seasonOf('Bass01.mkv')).toBeNull()
    expect(seasonOf('Reasons.mkv')).toBeNull()
    expect(seasonOf('Bla.subs01.mkv')).toBeNull()
  })

  test('says nothing about a film', () => {
    expect(seasonOf('Some.Film.2019.1080p.BluRay.x264-GROUP.mkv')).toBeNull()
    expect(seasonOf('release.nfo')).toBeNull()
    expect(seasonOf('asdfiasdfasoi.mp4')).toBeNull()
  })
})

describe('a season folder already in the destination', () => {
  test('is read whatever case or shape it is in', () => {
    expect(seasonFolderOf('S01')).toBe(1)
    expect(seasonFolderOf('s01')).toBe(1)
    expect(seasonFolderOf('S1')).toBe(1)
    expect(seasonFolderOf('Season 01')).toBe(1)
    expect(seasonFolderOf('season.2')).toBe(2)
    expect(seasonFolderOf('S00')).toBe(0)
  })

  test('is only a folder that is nothing but a season', () => {
    // A download that landed in the destination is not somewhere to put anything.
    expect(seasonFolderOf('Bla.S01E03.1080p')).toBeNull()
    expect(seasonFolderOf('bla.s01.complete')).toBeNull()
    expect(seasonFolderOf('Subs')).toBeNull()
    expect(seasonFolderOf('')).toBeNull()
  })
})

describe('what moves, and to which season', () => {
  test('a file that names its own season, with nothing above it, moves on its own', () => {
    expect(unitFor(file('bla.s01e03.mkv'))).toEqual({ season: 1, path: 'bla.s01e03.mkv' })
  })

  test('a folder that names an episode moves whole, whatever the files inside it are called', () => {
    // The folder is asked before the file. Otherwise this download would move the mkv on its own
    // and the folder for the srt beside it — keeping and dropping one folder at the same time.
    expect(unitFor(file('bla.s01e03/bla.s01e03.mkv'))).toEqual({ season: 1, path: 'bla.s01e03/bla.s01e03.mkv' })
    expect(unitFor(file('bla.s01e03/subs/eng.srt'))).toEqual({ season: 1, path: 'bla.s01e03/subs/eng.srt' })
    expect(unitFor(file('bla.s01e03/release.nfo'))).toEqual({ season: 1, path: 'bla.s01e03/release.nfo' })
  })

  test('a file whose name says nothing moves as the folder that does, contents and all', () => {
    // The whole point of the ticket: the file name is useless, the folder around it is not.
    expect(unitFor(file('bla.s01.e03/asdfiasdfasoi.mp4'))).toEqual({ season: 1, path: 'bla.s01.e03/asdfiasdfasoi.mp4' })
    expect(unitFor(file('bla.s01.e03/subs/eng.srt'))).toEqual({ season: 1, path: 'bla.s01.e03/subs/eng.srt' })
  })

  test('a pack of bare files fans out, each file judged on its own', () => {
    expect(unitFor(file('bla.s01.complete/bla.s01e01.mkv'))).toEqual({ season: 1, path: 'bla.s01e01.mkv' })
    expect(unitFor(file('bla.s01.complete/bla.s01e02.mkv'))).toEqual({ season: 1, path: 'bla.s01e02.mkv' })
  })

  test('a pack of per-episode folders moves each folder whole, without the pack around it', () => {
    // Deepest first: the episode's folder is what moves, not the pack it came in.
    expect(unitFor(file('bla.s01.complete/bla.s01e01/whatever.mkv'))).toEqual({ season: 1, path: 'bla.s01e01/whatever.mkv' })
  })

  test('a pack spanning two seasons lands in both', () => {
    expect(unitFor(file('bla.s01-s02/bla.s01e10.mkv'))?.season).toBe(1)
    expect(unitFor(file('bla.s01-s02/bla.s02e01.mkv'))?.season).toBe(2)
  })

  test('a file that names no season anywhere is left alone', () => {
    expect(unitFor(file('release.nfo'))).toBeNull()
    expect(unitFor(file('Subs/eng.srt'))).toBeNull()
    expect(unitFor(file('Some.Film.2019.1080p.x264/film.mkv'))).toBeNull()
  })

  test('a pack folder is opened up, not moved, so its leftovers stay behind', () => {
    // `bla.s01.complete` names a season and no episode, so it is a pack: its episodes go to their
    // season one by one, and what names nothing is left where it was rather than dragged along.
    expect(unitFor(file('bla.s01.complete/release.nfo'))).toBeNull()
  })

  test('a folder that names only a season is not a thing to move in one piece', () => {
    expect(episodeOf('bla.s01.complete')).toBeNull()
    expect(episodeOf('Bla Season 2')).toBeNull()
    expect(episodeOf('bla.s01e03')).toBe(1)
    expect(episodeOf('Bla - 1x03')).toBe(1)
  })
})

describe('naming a season folder that is not there yet', () => {
  test('writes two digits, in the shape asked for', () => {
    expect(seasonFolderName(1, 'S01')).toBe('S01')
    expect(seasonFolderName(1, 's01')).toBe('s01')
    expect(seasonFolderName(1, 'Season 01')).toBe('Season 01')
    expect(seasonFolderName(12, 'S01')).toBe('S12')
    expect(seasonFolderName(0, 'S01')).toBe('S00')
  })
})
