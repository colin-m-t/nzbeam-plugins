import { definePlugin } from 'nzbeam/sdk'

/**
 * Sample cleanup: once a download is unpacked and before it is moved into place, deletes the
 * small video files that ride along with a release — the samples — so only the release itself
 * lands in the category's folder. A video is a sample when it is smaller than the limit and there
 * is a larger video beside it; a download whose only video is small is left alone, since that
 * video is the download.
 *
 * It is also the worked example the docs point at, so it uses a bit of everything: settings that
 * hold everywhere, settings that differ per category, a hook that changes files on disk, and a
 * Test button that says what it would do without doing it.
 *
 * To try it: put this folder in the plugins mount — working in this repository it is already
 * there — press "Reload plugins" under Settings → Plugins, and switch it on. It runs for every
 * download then;
 * to hold it to some categories, turn "Apply to all categories" off on its page and tick it on
 * the categories that want it. That is the app's to decide, so nothing here has to ask.
 */
export default definePlugin({
  id: 'sample-cleanup',
  name: 'Sample cleanup',
  description: 'Deletes sample videos before a download is moved into place.',
  version: '1.0.1',

  // The SDK this was written against, written down rather than read from anywhere: it is what the
  // plugin claims, not what it happens to be running on. The Plugins page says what this app
  // speaks. A plugin built for another version still loads — the difference is a line on its row.
  sdkVersion: 1,
  sdkMinor: 1,

  settings: {
    onlyNamed: {
      type: 'boolean',
      label: 'Only files whose name says so',
      on: 'Only when one of the words below is in the file name',
      off: 'Any small video beside a larger one',
      default: false,
    },
    words: {
      type: 'list',
      label: 'Words that mark a sample',
      hint: 'Matched anywhere in the file name, whatever the case. Only used by the switch above.',
      default: ['sample', 'proof'],
      maxItems: 20,
      maxLength: 40,
    },
  },

  // What differs between the categories the plugin runs for. Anything the same everywhere belongs
  // in `settings` above, where it is filled in once.
  categorySettings: {
    maxSampleMb: {
      type: 'number',
      label: 'Delete videos smaller than (MB)',
      hint: 'A video under this size is a sample when a larger video sits beside it.',
      default: 50,
      min: 1,
      max: 5000,
      integer: true,
    },
  },

  hooks: {
    async 'download:beforeMove'({ download, files, settings, categorySettings, log, audit }) {
      const videos = files.filter(file => file.isVideo)
      // The limit this download's category holds. A download with no category gets the default.
      const limit = categorySettings.maxSampleMb * 1024 * 1024

      // Nothing here is big enough to be the release, so whatever these are, they are not samples.
      const largest = Math.max(0, ...videos.map(file => file.sizeBytes))
      if (largest < limit) return

      const named = (name: string) => settings.words.some(word => name.toLowerCase().includes(word.toLowerCase()))
      const samples = videos.filter(file => file.sizeBytes < limit && (!settings.onlyNamed || named(file.name)))

      for (const file of samples) {
        await file.remove()
        log(`removed ${file.relativePath} (${Math.round(file.sizeBytes / 1024 / 1024)} MB)`)
      }
      if (samples.length > 0) audit('samples_removed', { download: download.name, files: samples.map(file => file.relativePath) })
    },
  },

  test({ core, categorySettingsFor }) {
    // What every category would do, read one at a time — which is what a schedule or a route does
    // when it works over more than the one download a hook is handed.
    const limits = core.categories.list().map(category => `${category.name}: ${categorySettingsFor(category.id).maxSampleMb} MB`)
    if (limits.length === 0) return 'No categories yet, so every download would use the default limit.'
    return `Videos under the limit go when a larger one sits beside them — ${limits.join(', ')}.`
  },
})
