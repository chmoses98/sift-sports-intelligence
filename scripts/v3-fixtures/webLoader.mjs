// Browser-side (and Node 18+) reader of the committed fixture bundle: the reference implementation of the format in fixtures/real/README.md for a
// preview or shim that answers the app's published-document requests from captured data. No Node APIs: only fetch, DecompressionStream and TextDecoder.
//
//   const bundle = await openWebBundle('/sift-sports-intelligence/fixtures/real/');   // base URL of the directory that holds index.json and packs/
//   const fam = bundle.family('game');                                                  // { clock, urls, get(url) }
//   const doc = await fam.get('https://raw.githubusercontent.com/...');                 // { status, body: Uint8Array, text() } or null (answer 404)
//
// `fetchImpl` lets a test or a service worker supply its own transport.

async function gunzip(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function openWebBundle(base, fetchImpl = (...a) => fetch(...a)) {
  const root = base.endsWith('/') ? base : `${base}/`;
  const index = await (await fetchImpl(`${root}index.json`)).json();
  if (index.schema !== 'sift.v3.fixtures.index.v1') throw new Error(`unknown fixture index schema ${index.schema}`);
  const packs = new Map(); // pack name -> Promise<Uint8Array> (decompressed once, on first use)
  const rawPack = (name) => {
    if (!packs.has(name)) {
      const p = index.packs[name];
      packs.set(name, fetchImpl(`${root}${p.file}`).then(async (r) => {
        if (!r.ok) throw new Error(`pack ${name}: HTTP ${r.status}`);
        return gunzip(await r.arrayBuffer());
      }));
    }
    return packs.get(name);
  };
  return {
    index,
    families: () => Object.keys(index.families),
    family(name) {
      const fam = index.families[name];
      if (!fam) throw new Error(`no fixture family ${name}`);
      return {
        name,
        clock: fam.clock,
        urls: Object.keys(fam.urls),
        async get(url) {
          const e = fam.urls[url];
          if (!e) return null;
          if (!e.sha256) return { status: e.status, body: new Uint8Array(0), text: () => '' };
          const loc = index.documents[e.sha256];
          const raw = await rawPack(loc.pack);
          const body = raw.subarray(loc.offset, loc.offset + loc.length);
          return { status: e.status, body, text: () => new TextDecoder().decode(body) };
        },
      };
    },
  };
}
