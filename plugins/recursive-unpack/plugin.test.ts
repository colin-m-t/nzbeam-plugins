import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import plugin from './plugin'

/**
 * The hook over a real folder, with the unpackers faked: what each archive holds is written down
 * rather than packed, so the tests are about the part this plugin owns — which archives it opens,
 * how far it carries on, what it clears away, and what it leaves exactly as it found it.
 */

/**
 * An unpacker that writes what `holds` says the archive holds, into the folder it is run in. A
 * name ending in `/` is a folder and nothing in it, which is what 7z leaves behind when it is
 * asked to lay an archive's files out flat.
 */
function fakeUnpacker(holds: Record<string, string[]>, options: { missing?: string[], codes?: Record<string, number> } = {}) {
  const commands: string[][] = []
  const run = async (command: string[], runOptions?: { cwd?: string }) => {
    const program = command[0]!
    if (options.missing?.includes(program)) throw new Error(`${program} is not installed in the container.`)
    commands.push(command)
    const cwd = runOptions!.cwd!
    const archive = command.map(argument => argument.replace(/^\.\//, '')).find(argument => holds[argument] !== undefined)!
    const code = options.codes?.[archive] ?? 0
    if (code <= 1) {
      for (const name of holds[archive]!) {
        if (name.endsWith('/')) await mkdir(join(cwd, name), { recursive: true })
        else await Bun.write(join(cwd, name), 'x')
      }
    }
    return { code, stdout: '', stderr: code > 1 ? 'the archive is damaged' : '' }
  }
  return { run, commands }
}

/** One of the files the app says it is about to move. */
function file(folder: string, name: string) {
  return {
    name,
    relativePath: name,
    path: join(folder, name),
    sizeBytes: 10,
    extension: name.slice(name.lastIndexOf('.') + 1).toLowerCase(),
    isVideo: name.endsWith('.mkv'),
    isArchive: /\.(rar|zip|7z)$|\.r\d{2}$/i.test(name),
    remove: async () => {},
    rename: async () => {},
    placeAt: async () => '',
  }
}

interface RunOptions {
  /** What the app is about to move, which is the only thing the first round looks at. */
  listed: string[]
  /** What each archive holds, by its name. */
  holds: Record<string, string[]>
  /** What is on disk to begin with; `listed` when left out. */
  onDisk?: string[]
  depth?: number
  missing?: string[]
  codes?: Record<string, number>
}

/**
 * Runs the hook over a folder holding `onDisk`, and answers with what is in that folder afterwards
 * and what was logged. The folder is cleared away however the test ends.
 */
async function runHook(options: RunOptions): Promise<{ left: string[], logs: string[], commands: string[][] }> {
  const folder = await mkdtemp(join(tmpdir(), 'recursive-unpack-'))
  try {
    for (const name of options.onDisk ?? options.listed) await Bun.write(join(folder, name), 'x')
    const { run, commands } = fakeUnpacker(options.holds, { missing: options.missing, codes: options.codes })
    const logs: string[] = []
    const hook = plugin.hooks!['download:beforeMove']!
    await hook({
      files: options.listed.map(name => file(folder, name)),
      download: { name: 'Some.Release.1080p' },
      settings: { depth: options.depth ?? 3 },
      run,
      signal: new AbortController().signal,
      log: (message: string) => logs.push(message),
      audit: () => {},
    } as unknown as Parameters<typeof hook>[0])
    return { left: (await readdir(folder)).sort(), logs, commands }
  }
  finally {
    await rm(folder, { recursive: true, force: true })
  }
}

describe('the hook', () => {
  test('opens an archive that came out of an archive, and clears it away', async () => {
    const { left } = await runHook({
      listed: ['inner.rar', 'release.nfo'],
      holds: { 'inner.rar': ['movie.mkv'] },
    })
    expect(left).toEqual(['movie.mkv', 'release.nfo'])
  })

  test('carries on through what it just opened', async () => {
    // A rar holding a zip holding the film: the point of the whole plugin.
    const { left } = await runHook({
      listed: ['inner.rar'],
      holds: { 'inner.rar': ['inner.zip'], 'inner.zip': ['movie.mkv'] },
    })
    expect(left).toEqual(['movie.mkv'])
  })

  test('stops at the depth it was given', async () => {
    const { left } = await runHook({
      listed: ['inner.rar'],
      holds: { 'inner.rar': ['inner.zip'], 'inner.zip': ['movie.mkv'] },
      depth: 1,
    })
    expect(left).toEqual(['inner.zip'])
  })

  test('an archive that holds a copy of itself does not go round for ever', async () => {
    // The depth is what stops it; without it this would open the same file until the disk gave out.
    const { commands } = await runHook({
      listed: ['loop.rar'],
      holds: { 'loop.rar': ['loop.rar'] },
      depth: 5,
    })
    expect(commands.length).toBe(1)
  })

  test('clears away every volume of a set once it is open', async () => {
    const { left } = await runHook({
      listed: ['bla.part01.rar', 'bla.part02.rar', 'bla.part03.rar'],
      holds: { 'bla.part01.rar': ['movie.mkv'] },
    })
    expect(left).toEqual(['movie.mkv'])
  })

  test('opens a set once, not once per volume', async () => {
    const { commands } = await runHook({
      listed: ['bla.rar', 'bla.r00', 'bla.r01'],
      holds: { 'bla.rar': ['movie.mkv'] },
    })
    expect(commands.length).toBe(1)
    expect(commands[0]).toContain('bla.rar')
  })

  test('leaves the download alone when nothing in the image opens the kind', async () => {
    const { left, logs } = await runHook({
      listed: ['inner.zip'],
      holds: { 'inner.zip': ['movie.mkv'] },
      missing: ['7z', '7za', '7zz', 'unzip'],
    })
    expect(left).toEqual(['inner.zip'])
    expect(logs.join(' ')).toContain('left inner.zip alone')
  })

  test('keeps an archive that would not open', async () => {
    // A volume that never arrived, a password nobody has: the archive stays, so that whoever looks
    // at the folder afterwards still has the thing that failed.
    const { left, logs } = await runHook({
      listed: ['inner.rar'],
      holds: { 'inner.rar': ['movie.mkv'] },
      codes: { 'inner.rar': 3 },
    })
    expect(left).toEqual(['inner.rar'])
    expect(logs.join(' ')).toContain('the archive is damaged')
  })

  test('falls through to the next program that does the kind', async () => {
    const { left, commands } = await runHook({
      listed: ['inner.zip'],
      holds: { 'inner.zip': ['movie.mkv'] },
      missing: ['7z', '7za', '7zz'],
    })
    expect(commands[0]![0]).toBe('unzip')
    expect(left).toEqual(['movie.mkv'])
  })

  test('does not open the download\'s own archives a second time', async () => {
    // The app has already unpacked these and is not moving them; they simply have not been cleared
    // away yet. Going by what is on disk rather than by what the app listed would open them again.
    const { left, commands } = await runHook({
      listed: ['movie.mkv'],
      onDisk: ['movie.mkv', 'post.rar', 'post.r00', 'post.par2'],
      holds: { 'post.rar': ['movie.mkv'] },
    })
    expect(commands).toEqual([])
    expect(left).toEqual(['movie.mkv', 'post.par2', 'post.r00', 'post.rar'])
  })

  test('takes away the empty folders the unpacker leaves behind', async () => {
    // 7z lays the files out flat as it is asked to and still makes the folders they were in.
    // Left there, the app would move an empty Subs folder into the library.
    const { left } = await runHook({
      listed: ['inner.zip'],
      holds: { 'inner.zip': ['movie.mkv', 'eng.srt', 'Subs/'] },
      missing: ['7z', '7za', '7zz'],
    })
    expect(left).toEqual(['eng.srt', 'movie.mkv'])
  })

  test('keeps a folder the download already had', async () => {
    const { left } = await runHook({
      listed: ['inner.zip'],
      onDisk: ['inner.zip', 'extras/note.txt'],
      holds: { 'inner.zip': ['movie.mkv'] },
    })
    expect(left).toEqual(['extras', 'movie.mkv'])
  })

  test('leaves a download with no archives in it untouched', async () => {
    const { left, commands, logs } = await runHook({
      listed: ['movie.mkv', 'release.nfo'],
      holds: {},
    })
    expect(commands).toEqual([])
    expect(logs).toEqual([])
    expect(left).toEqual(['movie.mkv', 'release.nfo'])
  })
})
