import { describe, expect, test } from 'bun:test'
import { archiveSets, UNPACKERS } from './archives'

/**
 * What a folder's names add up to. The plugin's own behaviour is in plugin.test.ts; this settles
 * the part that has to be read right before anything is touched — which files are one archive, and
 * which of them the unpacker is pointed at.
 */

describe('archiveSets', () => {
  test('a rar on its own is its own set', () => {
    expect(archiveSets(['bla.rar'])).toEqual([{ kind: 'rar', first: 'bla.rar', volumes: ['bla.rar'] }])
  })

  test('points at the lowest part of a split rar, and carries the rest with it', () => {
    const sets = archiveSets(['bla.part03.rar', 'bla.part01.rar', 'bla.part02.rar'])
    expect(sets).toEqual([{
      kind: 'rar',
      first: 'bla.part01.rar',
      volumes: ['bla.part01.rar', 'bla.part02.rar', 'bla.part03.rar'],
    }])
  })

  test('points at the .rar of an old-style set, whose volumes follow it', () => {
    const sets = archiveSets(['bla.r01', 'bla.rar', 'bla.r00'])
    expect(sets).toEqual([{
      kind: 'rar',
      first: 'bla.rar',
      volumes: ['bla.rar', 'bla.r00', 'bla.r01'],
    }])
  })

  test('points at the .zip of a split zip, not at its first volume', () => {
    // The pieces of a split zip come before the .zip, which is the one holding the table of
    // contents — so the one the unpacker has to be given.
    const sets = archiveSets(['bla.z01', 'bla.z02', 'bla.zip'])
    expect(sets[0]!.first).toBe('bla.zip')
    expect(sets[0]!.volumes).toEqual(['bla.zip', 'bla.z01', 'bla.z02'])
  })

  test('points at .001 of a split 7z', () => {
    const sets = archiveSets(['bla.7z.002', 'bla.7z.001'])
    expect(sets).toEqual([{ kind: '7z', first: 'bla.7z.001', volumes: ['bla.7z.001', 'bla.7z.002'] }])
  })

  test('leaves half an archive alone', () => {
    // Volumes with nothing to point at. Opening them would make something incomplete out of a
    // download that is better left saying plainly that a volume never arrived.
    expect(archiveSets(['bla.r00', 'bla.r01'])).toEqual([])
    expect(archiveSets(['bla.7z.002', 'bla.7z.003'])).toEqual([])
  })

  test('keeps two archives in one folder apart', () => {
    const sets = archiveSets(['one.rar', 'one.r00', 'two.part01.rar', 'two.part02.rar'])
    expect(sets.map(set => set.first)).toEqual(['one.rar', 'two.part01.rar'])
    expect(sets[0]!.volumes).toEqual(['one.rar', 'one.r00'])
    expect(sets[1]!.volumes).toEqual(['two.part01.rar', 'two.part02.rar'])
  })

  test('gathers a set whose volumes are cased differently from its first', () => {
    const sets = archiveSets(['Bla.rar', 'bla.R00'])
    expect(sets).toEqual([{ kind: 'rar', first: 'Bla.rar', volumes: ['Bla.rar', 'bla.R00'] }])
  })

  test('is not interested in anything else', () => {
    expect(archiveSets(['one.mkv', 'release.nfo', 'poster.jpg', 'no-extension'])).toEqual([])
  })

  test('a file named after a season is not a rar volume', () => {
    // `.s01` reads as a rar volume, which is why nothing is opened on the strength of a volume
    // alone: there is no .rar leading these, so there is no set.
    expect(archiveSets(['Some.Show.S01', 'Some.Show.S01.mkv'])).toEqual([])
  })

  test('comes out the same however the names arrive', () => {
    const names = ['two.rar', 'one.zip', 'three.7z']
    const first = archiveSets(names).map(set => set.first)
    expect(archiveSets([...names].reverse()).map(set => set.first)).toEqual(first)
    expect(first).toEqual(['one.zip', 'three.7z', 'two.rar'])
  })
})

describe('UNPACKERS', () => {
  test('unrar is what a rar is opened with, flat and without asking anything', () => {
    const [first] = UNPACKERS.rar
    expect(first!.program).toBe('unrar')
    const args = first!.args('bla.rar', '/tmp/here')
    // `e` rather than `x`: flat, so nothing ends up in a folder the app's move would not carry.
    expect(args[0]).toBe('e')
    expect(args).toContain('-p-')
    expect(args).toContain('-or')
    expect(args).toContain('/tmp/here/')
  })

  test('a zip is tried with p7zip under each name it is installed as, then unzip', () => {
    expect(UNPACKERS.zip.map(unpacker => unpacker.program)).toEqual(['7z', '7za', '7zz', 'unzip'])
  })
})
