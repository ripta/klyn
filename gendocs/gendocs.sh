#!/usr/bin/env bash

scriptdir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

tpl="$scriptdir/template.html"
css="$scriptdir/klyn.css"
sitejs="$scriptdir/site.js"
searchpage="$scriptdir/search.html"
filters=(--lua-filter="$scriptdir/h1-title.lua" --lua-filter="$scriptdir/md-links.lua")

mkdir -p output

find . -path ./target -prune -o -path ./.git -prune -o -path ./output -prune -o -name '*.md' -print | while read -r f; do
  rel="${f#./}"
  out="output/${rel%.md}.html"
  mkdir -p "$(dirname "$out")"
  pandoc "$rel" --template=$tpl "${filters[@]}" --toc -s -o "$out"
done

# Fall back to README.md for directories that have no index.md of their own.
find . -path ./target -prune -o -path ./.git -prune -o -path ./output -prune -o -name 'README.md' -print | while read -r f; do
  dir="$(dirname "$f")"
  [ -f "$dir/index.md" ] && continue
  rel="${dir#./}"
  out="output${rel:+/$rel}/index.html"
  mkdir -p "$(dirname "$out")"
  pandoc "$f" --template=$tpl "${filters[@]}" --toc -s -o "$out"
done

cp -p "$css" ./output
cp -p "$sitejs" ./output
cp -p "$searchpage" ./output/search.html

pagefind --site output --quiet
