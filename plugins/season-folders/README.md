# Season folders

Puts each episode in the season folder it belongs to, in the category's own folder, instead of
leaving it in a folder named after the download.

```
/downloads/tv/
├── S01/
│   ├── bla.s01e03.mkv
│   └── bla.s01.e04/asdfiasdfasoi.mp4
└── S02/
    └── bla.s02e01.mkv
```

Needs **SDK 1.1** or newer. On an older app it loads and its row says so, but it has no way to put
anything anywhere.

## What it does

Nothing is renamed and nothing is restructured. What moves is whatever named the episode — a
folder if the episode came in one, the file itself if it did not:

| What the download holds | Where it goes |
| --- | --- |
| `bla.s01e03.mkv` on its own | the **file** moves: `S01/bla.s01e03.mkv` |
| `bla.s01.e03/asdfiasdfasoi.mp4` — a folder that names the episode | that **folder** moves whole: `S01/bla.s01.e03/asdfiasdfasoi.mp4`, subtitles, nfo and all |
| a pack of bare episode files | the pack is opened up and each file goes to its own season |
| a pack of per-episode folders | each episode's folder moves whole, without the pack around it |
| a pack spanning two seasons | fills `S01` and `S02` both, since every episode is judged on its own |
| an obfuscated post — `2ea3afc4….mkv`, naming nothing | goes by the **download's** name: the folder it would have landed in moves whole, `S04/From.S04E03.…-ANARCHY/2ea3afc4….mkv` |
| anything naming no season at all | **left alone** — it lands where it always did, in a folder named after the download |

A folder is only a thing to move whole when it names an **episode**. One that names a season and
no episode — `bla.s01`, `Bla.S02.COMPLETE` — is a pack, so it is opened up rather than carried
across. That is also what keeps a download from both keeping and dropping the same folder: the
folder is asked before the files in it, so every file under it goes the same way.

That last row is the trade-off worth knowing: a download that carries extras leaves things in two
places, the episodes in their season folders and the extras in the download's own folder. It is
the price of never touching what the plugin cannot read.

The download's own name is the last resort, and only when the post brought nothing to go on. Much
of Usenet is posted obfuscated — the release is `From.S04E03.…-ANARCHY` but the file inside is
`2ea3afc453d04be4a1abe1c5f624ad7b.mkv` — and there the download is the only thing that says what
came down. Its folder is what moves, so the episode is still named where a library reads it and
the plugin still renames nothing. Anything the post itself says wins over it, and a pack is left
out: its folder already names a season, so opening it up still leaves its extras behind.

A season folder already in the destination is reused whatever its case — `s01`, `S01` and
`Season 01` all count — so nothing ever makes a second folder for a season that has one. A file
that would land on top of one already there gets a number instead: nothing is overwritten.

## Settings

| | |
| --- | --- |
| New season folders are named | `S01`, `s01` or `Season 01`. Only used for a season with no folder yet; one already there is reused as it is. Per category, since two libraries may be laid out by different hands |

**Test** says how each category would name a new folder, without moving anything.

## Which downloads it runs for

Not the plugin's to decide. **Apply to all categories** is on to begin with; turn it off on the
plugin's page and tick the plugin on the categories that want it, under Settings → Categories.
A film category is the obvious one to leave unticked.

## What it does not do

It does not rename anything, look anything up, or know what a show is called — it reads season
numbers out of names and nothing more. A library that wants a folder per show, or files renamed to
a scheme, wants something else in front of it.
