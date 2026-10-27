// Tiny argument reader shared by the fixture CLIs: `--name value`, `--flag`, and positional leftovers.
export function parseArgs(argv, flags = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (flags.includes(k)) out[k] = true;
      else {
        if (i + 1 >= argv.length) throw new Error(`--${k} needs a value`);
        out[k] = argv[++i];
      }
    } else out._.push(a);
  }
  return out;
}
export const need = (a, k) => {
  if (a[k] === undefined) {
    console.error(`missing --${k}`);
    process.exit(64);
  }
  return a[k];
};
