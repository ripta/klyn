#!/usr/bin/env bash

if ! command -v pandoc >/dev/null 2>&1; then
  echo "gendocs.sh: pandoc not found in PATH" >&2
  exit 1
fi

scriptdir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

tpl="$scriptdir/template.html"
css="$scriptdir/klyn.css"
sitejs="$scriptdir/site.js"
searchpage="$scriptdir/search.html"
filters=(--lua-filter="$scriptdir/h1-title.lua" --lua-filter="$scriptdir/md-links.lua")

outdir="output"
verbose=0

while getopts "o:v" opt; do
  case "$opt" in
    o) outdir="$OPTARG" ;;
    v) verbose=1 ;;
    *) echo "Usage: $0 [-o output_dir] [-v]" >&2; exit 1 ;;
  esac
done

log() {
  if [ "$verbose" -eq 1 ]; then
    echo "$@"
  fi
}

log "Building docs in $(pwd) -> $outdir"

mkdir -p "$outdir"
prune="./${outdir#./}"

find . -path ./target -prune -o -path ./.git -prune -o -path "$prune" -prune -o -name '*.md' -print | while read -r f; do
  rel="${f#./}"
  out="$outdir/${rel%.md}.html"
  mkdir -p "$(dirname "$out")"
  log "Converting $rel -> $out"
  pandoc "$rel" --template=$tpl "${filters[@]}" --toc -s -o "$out"
done

# Fall back to README.md for directories that have no index.md of their own.
find . -path ./target -prune -o -path ./.git -prune -o -path "$prune" -prune -o -name 'README.md' -print | while read -r f; do
  dir="$(dirname "$f")"
  [ -f "$dir/index.md" ] && continue
  rel="${dir#./}"
  out="$outdir${rel:+/$rel}/index.html"
  mkdir -p "$(dirname "$out")"
  log "Converting ${f#./} -> $out"
  pandoc "$f" --template=$tpl "${filters[@]}" --toc -s -o "$out"
done

log "Copying site assets"
cp -p "$css" "$outdir"
cp -p "$sitejs" "$outdir"
cp -p "$searchpage" "$outdir/search.html"

log "Indexing"
if [ "$verbose" -eq 1 ]; then
  pagefind --site "$outdir" --verbose
else
  pagefind --site "$outdir" --quiet
fi

log "Done"
