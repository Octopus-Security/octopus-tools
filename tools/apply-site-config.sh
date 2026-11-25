#!/bin/sh
# apply-site-config.sh <html dir> <site.conf>
# Replace the neutral icon, footer and pdf.js addresses in the pages with the ones
# in site.conf. No file, or a key left out: that part stays as committed. The file
# is read as data, never executed. POSIX sh + sed: the nginx image has nothing else.
set -eu
html=$1
conf=$2
[ -f "$conf" ] || { echo 'site config: none, neutral defaults kept'; exit 0; }

get() { sed -n "s/^$1=//p" "$conf" | tail -n 1 | tr -d '\r'; }
# A value reaches both sed and HTML, so refuse what either would interpret.
check() {
  case "$2" in *[\|\&\\\<\>\"]*) echo "site config: $1 contains a character that is not allowed" >&2; exit 1;; esac
}
url() {
  check "$1" "$2"
  case "$2" in ''|https://*|http://*|/*) ;; *) echo "site config: $1 must start with https://, http:// or /" >&2; exit 1;; esac
}

brand=$(get BRAND_BASE); name=$(get FOOTER_NAME); link=$(get FOOTER_URL); pdfjs=$(get PDFJS_BASE)
url BRAND_BASE "$brand"; check FOOTER_NAME "$name"; url FOOTER_URL "$link"; url PDFJS_BASE "$pdfjs"
if { [ -n "$name" ] && [ -z "$link" ]; } || { [ -z "$name" ] && [ -n "$link" ]; }; then
  echo 'site config: set FOOTER_NAME and FOOTER_URL together' >&2; exit 1
fi

for page in "$html"/*.html; do
  if [ -n "$brand" ]; then sed -i "s|href=\"/brand/|href=\"${brand%/}/|" "$page"; fi
  if [ -n "$pdfjs" ]; then sed -i "s|src=\"/vendor/pdfjs-[0-9.]*/pdf\.min\.js[^\"]*\"|src=\"${pdfjs%/}/pdf.min.js\"|" "$page"; fi
  if [ -n "$name" ]; then
    sed -i "/<footer class=\"site-footer\">/,/<\/footer>/s|<a href=\"/\">Octopus Tools</a>|<a href=\"$link\" target=\"_blank\" rel=\"noopener\">$name</a>|" "$page"
  fi
done
echo 'site config: applied'
