/**
 * Brings `sdk/nzbeam-sdk.ts` up to date: `bun run sdk:sync`.
 *
 * That file is the whole of what a plugin imports and the only thing the editor needs, so this
 * repository never needs an nzbeam checkout to be worked in — but the person changing the SDK
 * has one, and while both repositories are private that is where the file comes from. Once they
 * are public it is fetched over HTTP instead, so anyone can run this.
 *
 *   bun run sdk:sync                          # a sibling nzbeam checkout, ../nzbeem
 *   NZBEAM_REPO=~/src/nzbeam bun run sdk:sync # a checkout somewhere else
 *   NZBEAM_REF=v1.4.0 bun run sdk:sync        # over HTTP, from a tag or branch of the public repo
 *
 * Run it after an SDK bump in nzbeam, then `bun run typecheck` to see which plugins the change
 * reaches. Until a plugin is released against the new version it keeps running for users under
 * the version it was built for.
 */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fail, REPO_ROOT, SDK_ROLLUP, sdkVersionOf } from './lib'

const RELATIVE_PATH = 'sdk/nzbeam-sdk.ts'
const DEFAULT_CHECKOUT = '../nzbeem'
const RAW_URL = 'https://raw.githubusercontent.com/colin-m-t/nzbeam'

const before = existsSync(SDK_ROLLUP) ? sdkVersionOf(await Bun.file(SDK_ROLLUP).text()) : null
const ref = process.env.NZBEAM_REF
const { text, from } = ref ? await fromGitHub(ref) : await fromCheckout()

const after = sdkVersionOf(text)
await mkdir(dirname(SDK_ROLLUP), { recursive: true })
await Bun.write(SDK_ROLLUP, text)

const was = before ? `${before.major}.${before.minor}` : 'nothing'
const now = `${after.major}.${after.minor}`
console.log(`sdk/nzbeam-sdk.ts is SDK ${now}, from ${from} (was ${was}).`)
if (before && after.major > before.major) {
  console.log('That is a major: run `bun run typecheck` to see which plugins it reaches.')
}

/** The file from a local nzbeam checkout, which is where it comes from while the repos are private. */
async function fromCheckout(): Promise<{ text: string, from: string }> {
  const checkout = expand(process.env.NZBEAM_REPO ?? DEFAULT_CHECKOUT)
  const path = join(checkout, RELATIVE_PATH)
  if (!existsSync(path)) {
    fail(
      `No ${RELATIVE_PATH} under ${checkout}.\n`
      + 'Point NZBEAM_REPO at an nzbeam checkout, or set NZBEAM_REF to fetch a tag of the public repo.',
    )
  }
  return { text: await Bun.file(path).text(), from: path }
}

/** The file over HTTP, for when nzbeam is public and there is no checkout to read. */
async function fromGitHub(ref: string): Promise<{ text: string, from: string }> {
  const url = `${RAW_URL}/${ref}/${RELATIVE_PATH}`
  const response = await fetch(url)
  if (!response.ok) fail(`${url} answered ${response.status}. Is nzbeam public, and is ${ref} a tag it has?`)
  return { text: await response.text(), from: url }
}

function expand(path: string): string {
  const home = path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
  return isAbsolute(home) ? home : resolve(REPO_ROOT, home)
}
