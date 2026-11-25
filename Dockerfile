FROM nginx:alpine
RUN apk upgrade --no-cache
COPY public/ /usr/share/nginx/html/
# Icons, footer link and the pdf.js address: neutral as committed, replaced from
# config/site.conf when that file exists. Runs before the build hash is taken.
COPY config/ /tmp/config/
COPY tools/apply-site-config.sh /tmp/apply-site-config.sh
RUN sh /tmp/apply-site-config.sh /usr/share/nginx/html /tmp/config/site.conf \
    && rm -rf /tmp/config /tmp/apply-site-config.sh
# Replaces the stock default.conf — see nginx.conf for why the cache policy matters.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ── Deploy verification ───────────────────────────────────────────────────────
#
# A deploy that never landed and one that landed without helping look identical
# from outside. /api/build tells them apart. There is no
# application process to compute a stamp at startup, so it is computed HERE,
# from the files actually in the image, and written out as a static document.
#
# DERIVED, not typed. A stamp someone has to remember to bump reports "nothing
# changed" for a deploy that did, the first time anyone forgets — a check
# failing in the confident direction. This one cannot drift: it is a hash of
# every served .html, .css and .js.
#
# `builtAt` rather than `startedAt`, which the Node services report. There is no
# application start here — nginx serves a file — so the honest value is when the
# image was built, and it is named for what it is.
#
# The api/ directory is created after the hash is taken, so the stamp never
# covers its own output.
RUN set -eu; \
    BUILD="$(find /usr/share/nginx/html -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' \) \
             | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -c1-12)"; \
    mkdir -p /usr/share/nginx/html/api; \
    printf '{"ok":true,"service":"octopus-tools","build":"%s","builtAt":"%s"}\n' \
      "$BUILD" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /usr/share/nginx/html/api/build

EXPOSE 80
