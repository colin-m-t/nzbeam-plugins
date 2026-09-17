import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import plugin from './plugin'

/**
 * The hook itself, over a real destination folder. `unitFor` in season.test.ts settles what moves;
 * this settles what the plugin does with that — which folder it picks, when it makes one, and what
 * it leaves alone.
 */

/** A file as the hook is handed it. `placeAt` records rather than moves: the app's own tests cover the moving. */
function fakeFile(relativePath: string, placed: string[]) {
  return {
    name: relativePath.split('/').pop()!,
    relativePath,
    path: join('/download-temp/job', relativePath),
    sizeBytes: 100,
    extension: relativePath.split('.').pop()!,
    isVideo: relativePath.endsWith('.mkv') || relativePath.endsWith('.mp4'),
    isArchive: false,
    remove: async () => {},
    rename: async () => {},
    placeAt: async (path: string) => {
      placed.push(path)
      return join('/downloads/tv', path)
    },
  }
}

/**
 * Runs the hook over `names` with `destination` as it stands, and answers with the paths it asked
 * for. The download is called something that names no season unless a test says otherwise, so what
 * the files themselves say is all that is being read.
 */
async function run(
  destination: string,
  names: string[],
  newFolder = 'S01',
  downloadName = 'Whatever.It.Was.Called',
): Promise<string[]> {
  const placed: string[] = []
  const hook = plugin.hooks!['download:beforeMove']!
  await hook({
    files: names.map(name => fakeFile(name, placed)),
    destination,
    download: { name: downloadName },
    categorySettings: { newFolder },
    log: () => {},
    audit: () => {},
  } as unknown as Parameters<typeof hook>[0])
  return placed
}

/** A destination folder holding `folders`, cleared away however the test ends. */
async function withDestination(folders: string[], body: (destination: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'season-folders-'))
  try {
    for (const folder of folders) await mkdir(join(root, folder), { recursive: true })
    await body(root)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('the hook', () => {
  test('puts a single episode in a season folder it makes', async () => {
    await withDestination([], async (destination) => {
      expect(await run(destination, ['bla.s01e03.mkv'])).toEqual(['S01/bla.s01e03.mkv'])
    })
  })

  test('reuses a season folder already there, whatever its case', async () => {
    // The whole reason the plugin reads the destination: the app does no case folding, so asking
    // for S01 where s01 sits would leave a library with both.
    await withDestination(['s01'], async (destination) => {
      expect(await run(destination, ['bla.s01e03.mkv'])).toEqual(['s01/bla.s01e03.mkv'])
    })
    await withDestination(['Season 01'], async (destination) => {
      expect(await run(destination, ['bla.s01e03.mkv'])).toEqual(['Season 01/bla.s01e03.mkv'])
    })
  })

  test('names a new folder the way the category asked', async () => {
    await withDestination([], async (destination) => {
      expect(await run(destination, ['bla.s02e01.mkv'], 's01')).toEqual(['s02/bla.s02e01.mkv'])
      expect(await run(destination, ['bla.s02e01.mkv'], 'Season 01')).toEqual(['Season 02/bla.s02e01.mkv'])
    })
  })

  test('keeps a pack together in one folder it made for the first of them', async () => {
    await withDestination([], async (destination) => {
      const placed = await run(destination, ['bla.s01e01.mkv', 'bla.s01e02.mkv', 'bla.s01e03.mkv'])
      expect(placed).toEqual(['S01/bla.s01e01.mkv', 'S01/bla.s01e02.mkv', 'S01/bla.s01e03.mkv'])
    })
  })

  test('splits a pack that spans two seasons, reusing what is there for one of them', async () => {
    await withDestination(['s01'], async (destination) => {
      const placed = await run(destination, ['bla.s01e10.mkv', 'bla.s02e01.mkv'])
      expect(placed).toEqual(['s01/bla.s01e10.mkv', 'S02/bla.s02e01.mkv'])
    })
  })

  test('moves a folder whole when the file name says nothing', async () => {
    await withDestination([], async (destination) => {
      const placed = await run(destination, ['bla.s01.e03/asdfiasdfasoi.mp4', 'bla.s01.e03/subs/eng.srt'])
      expect(placed).toEqual(['S01/bla.s01.e03/asdfiasdfasoi.mp4', 'S01/bla.s01.e03/subs/eng.srt'])
    })
  })

  test('leaves what names no season alone', async () => {
    await withDestination([], async (destination) => {
      expect(await run(destination, ['release.nfo', 'poster.jpg', 'Some.Film.2019.1080p.mkv'])).toEqual([])
    })
  })

  test('a destination that is not there yet is not an error', async () => {
    // The first download into a fresh category: placeAt makes the folders on the way.
    expect(await run('/nowhere/at/all', ['bla.s01e03.mkv'])).toEqual(['S01/bla.s01e03.mkv'])
  })

  test('a file that cannot be placed does not stop the rest', async () => {
    await withDestination([], async (destination) => {
      const placed: string[] = []
      const hook = plugin.hooks!['download:beforeMove']!
      const files = [
        { ...fakeFile('bla.s01e01.mkv', placed), placeAt: async () => { throw new Error('is not a path inside the destination.') } },
        fakeFile('bla.s01e02.mkv', placed),
      ]
      await hook({ files, destination, download: { name: 'Whatever.It.Was.Called' }, categorySettings: { newFolder: 'S01' }, log: () => {}, audit: () => {} } as unknown as Parameters<typeof hook>[0])
      expect(placed).toEqual(['S01/bla.s01e02.mkv'])
    })
  })

  test('an obfuscated post goes by the download, folder and all', async () => {
    await withDestination([], async (destination) => {
      const release = 'From.S04E03.Merrily.We.Go.1080p.AMZN.WEBRip.DD.5.1.x265-ANARCHY'
      const placed = await run(destination, ['2ea3afc453d04be4a1abe1c5f624ad7b.mkv'], 'S01', release)
      expect(placed).toEqual([`S04/${release}/2ea3afc453d04be4a1abe1c5f624ad7b.mkv`])
    })
  })

  test('an obfuscated post reuses a season folder already there, as any other does', async () => {
    await withDestination(['Season 04'], async (destination) => {
      const release = 'From.S04E03.Merrily.We.Go.1080p.AMZN.WEBRip.DD.5.1.x265-ANARCHY'
      const placed = await run(destination, ['2ea3afc453d04be4a1abe1c5f624ad7b.mkv'], 'S01', release)
      expect(placed).toEqual([`Season 04/${release}/2ea3afc453d04be4a1abe1c5f624ad7b.mkv`])
    })
  })
})
