# statusphere.html

Klyn `statusphere.html` is a read-only viewer for
[Statusphere](https://github.com/bluesky-social/statusphere-example-app)
statuses. Statusphere is the atproto example app. Each status is an
`xyz.statusphere.status` record holding one emoji.

The page needs no server. Every request goes from the browser to public
services.

## How It Works

With no parameters, the page shows the network feed:

```
/statusphere.html
```

With `?at=`, it shows one account. The value can be a handle or a DID:

```
/statusphere.html?at=ripta.i6y.me
```

## Network Feed

The feed comes from the [UFOs](https://ufos.microcosm.blue) API. UFOs returns
the most recent records it saw on the firehose. It has no paging, so the feed
covers a fixed recent window. Refresh fetches it again.

Handles and avatars come from the Bluesky AppView in batches of 25. Accounts
the AppView does not know fall back to the handle in their PLC document.

## Account View

The page resolves the handle and reads statuses straight from the account's
PDS. It shows the current status, the 10 latest, and a tally of the most-used
statuses over the last 100.

## Untrusted Statuses

The lexicon asks for one grapheme, but nothing enforces it. Anyone can write
any string. The page always renders a status as text, never as HTML.

- One grapheme is shown oversized.
- Two or three graphemes are shown at a medium size.
- Anything longer is shown as normal text, truncated at 140 graphemes.

Each status links to its record in `atproto.html`.
