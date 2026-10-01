# atproto.html

Klyn `atproto.html` is a client-side explorer for AT Protocol accounts. It
needs no server. Every request goes from the browser to public services that
send `Access-Control-Allow-Origin: *`.

## How It Works

Access with a `?at=` query parameter. The value can be a handle, a DID, or an
`at://` URI:

```
/atproto.html?at=ripta.i6y.me
/atproto.html?at=did:plc:43bt2xw6pcnicbiaupyhmbpg
/atproto.html?at=ripta.i6y.me/app.bsky.actor.profile/self
```

The lookup box also accepts `bsky.app` profile and post URLs.

Add `&view=identity`, `&view=pds`, or `&view=blobs` to open a specific view.
Every page is a URL, so Back works and links can be shared.

## Views

- Overview shows handle resolution, the DID summary, and repository status.
- DID document shows the raw document. For `did:plc` it also shows the PLC
  operation log as a timeline of changes.
- PDS shows `describeServer`, the server version, and this account's repo
  status.
- Collections are listed in the sidebar. Each one pages through its records.
- A record shows its JSON. `at://` URIs and DIDs inside it link back into the
  explorer. Referenced blobs show as previews.
- Blobs pages through `listBlobs`. Previews load on demand because the list
  has no MIME types.

## Where Data Comes From

| Data | Source |
|---|---|
| Handle to DID | DNS TXT via `cloudflare-dns.com` DoH, `https://<handle>/.well-known/atproto-did`, and `public.api.bsky.app` |
| `did:plc` document and log | `plc.directory` |
| `did:web` document | `https://<host>/.well-known/did.json` |
| Records, blobs, repo status | The PDS listed in the DID document |

The HTTPS handle check often fails in a browser. Many hosts do not send CORS
headers on `/.well-known/atproto-did`. The handle still counts as verified if
DNS or the AppView agrees with the DID document. A `did:web` host without CORS
headers cannot be resolved at all.
