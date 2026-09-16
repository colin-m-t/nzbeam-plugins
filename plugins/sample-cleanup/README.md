# Sample cleanup

Deletes the sample videos that ride along with a release, once it is unpacked and before it is
moved into place, so only the release itself lands in the category's folder.

A video counts as a sample when it is smaller than the limit **and** there is a larger video
beside it. A download whose only video is small is left alone — that video is the download.

## Settings

| | |
| --- | --- |
| Only files whose name says so | when on, a video is only deleted if one of the words below is in its name. Off deletes any small video that has a larger one beside it |
| Words | what counts as saying so: `sample`, `proof`, whatever you add |
| Delete videos smaller than (MB) | the limit. Per category, so a TV category can hold a lower one than films |

**Test** says what it would delete on the download it last saw, without deleting anything.

## Which downloads it runs for

Not the plugin's to decide. **Apply to all categories** is on to begin with; turn it off on the
plugin's page and tick the plugin on the categories that want it, under Settings → Categories.

## What it is an example of

It is the worked example the [plugin reference](https://github.com/colin-m-t/nzbeam/blob/master/docs/PLUGIN_DEV.md)
points at, so it uses a bit of everything: settings that hold everywhere, settings that differ per
category, a `download:beforeMove` hook that changes files on disk, an audit note, and a `test`
behind the Test button. Copy the folder, or start from `bun run new <your-plugin>` and take the
parts you need.
