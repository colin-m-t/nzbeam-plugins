# Recursive unpack

Opens the archives that come out of an archive, so a post that was packed twice lands as a film
rather than as a rar.

```
before                          after
├── release.nfo                 ├── release.nfo
└── inner.rar                   └── movie.mkv
    └── inner.zip
        └── movie.mkv
```

## What it does

NZBeam runs unrar over what the post brought down and stops there, which is right nearly every
time. The exception is the post that was packed twice — a rar holding a rar, a rar holding a zip.
Its unpacked folder holds an archive, that archive is what gets moved into the library, and
whatever is inside it never comes out.

This carries on from where the app stopped. Once the download is unpacked and before anything is
moved, whatever the app is about to move that is still an archive is opened where it stands, its
own pieces are cleared away, and whatever came out is looked at again — down to the depth on the
plugin's page.

| What the download holds | What happens |
| --- | --- |
| `inner.rar` beside the film | opened; what is in it is moved instead of the rar |
| `inner.rar` holding `inner.zip` holding the film | both opened, one round after the other |
| `bla.part01.rar` … `bla.part08.rar` | opened **once**, at `part01`; all eight pieces go together |
| `bla.rar` with `bla.r00`, `bla.r01` behind it | the same, pointed at the `.rar` |
| `bla.r00` and `bla.r01` with no `.rar` | **left alone** — half an archive is not opened into something incomplete |
| an archive the image has no program for | **left alone**, with the reason in the log |
| an archive that will not open — damaged, a volume missing, a password | **left alone**, with what the program said in the log |
| the download's own archives, which the app already unpacked | never opened again |
| several archives side by side | each opened into a folder named after it, so their contents do not mix |

**Nothing here ever fails a download.** An archive that cannot be opened stays exactly where it
is, so whoever looks at the folder afterwards still has the thing that failed, and the download
lands as it would have without the plugin.

### Which programs it needs

| Kind | Opened with |
| --- | --- |
| `.rar`, `.r00`, `.partNN.rar` | `unrar` |
| `.zip`, `.zNN` | `7z`, `7za` or `7zz`, else `unzip` |
| `.7z`, `.7z.001` | `7z`, `7za` or `7zz` |

NZBeam's image carries `unrar` and `p7zip`, so all three work as they stand. The alternatives are
listed for an image built before p7zip was added to it, or one somebody else put together; on one
of those the log says which program was wanted — *left inner.zip alone: 7z is not installed in the
container* — and the download lands with the zip still in it.

### Where the files land

Flat — a nested archive's own folders are not kept, because each unpacker lays them out
differently and what comes out has to be somewhere the app will find it either way.

**Where that flat folder is depends on how many archives are being opened together.** One on its
own is opened where it stands, beside its own files, so nothing gains a level for no reason:

```
before                          after
└── Some.Album.7z               ├── 01 - one.flac
    ├── 01 - one.flac           └── 02 - two.flac
    └── 02 - two.flac
```

Several in one place each get a folder named after them, so four albums do not come out as one
heap of songs with no way back to which was which:

```
before                          after
├── Album One.7z                ├── Album One/
│   └── 01 - song.flac          │   └── 01 - song.flac
├── Album Two.7z                ├── Album Two/
│   └── 01 - song.flac          │   └── 01 - song.flac
└── cover.jpg                   └── cover.jpg
```

Each of those folders is then its own little world: an archive found inside one is opened inside
it, by the same rule. The folders the download already had — the ones the app's own unpacking
made — are untouched.

A file that would land on a name already taken is renamed by the unpacker rather than overwriting
it, except under `unzip`, which has no such option and overwrites. 7z lays the files out flat as it
is asked to and still makes the folders they were in; those are taken away again, so nothing empty
lands in the library.

## Settings

| | |
| --- | --- |
| How many archives deep to go | 1 to 10, **3** by default. Counted from the first archive found inside what the app unpacked. Three is deeper than anything posted in practice; the limit is there so a pair of archives holding each other cannot go round for ever |

**Test** says how deep it would go and which programs it would reach for. It opens nothing.

## Which downloads it runs for

Not the plugin's to decide. **Apply to all categories** is on to begin with; turn it off on the
plugin's page and tick the plugin on the categories that want it, under Settings → Categories.

## What it does not do

It does not unpack `.tar`, `.gz` or anything else that is not a rar, a zip or a 7z — those are not
what Usenet posts are packed in, and a `.gz` is more often a file that is meant to stay that way.
It does not repair anything, and it does not know a password: an encrypted archive is left alone
like any other it cannot open.
