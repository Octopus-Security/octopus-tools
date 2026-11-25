# octopus-tools

Static browser utilities — speed reader, typing trainer, hash generator, base converter, subnet
calculator, network planner (VLSM, supernetting, IPv6), tech calculators and password generator.

Plain HTML and JS in `public/`, served by nginx. No backend, no accounts, no
build step, and no data leaves the browser.

The two calculators aimed at coursework show their working rather than only
their answer: the base converter prints the positional expansion, the division
table and the bit regrouping; the subnet calculator prints the AND, the OR and
the borrowed bits.

```sh
npm test          # node --test test/*.test.js
npm run stamp     # rewrite the ?v= content stamps on CSS and JS links
npm run check     # fail if any stamp is stale (pre-push gate)
```

## Self-hosting

You need Docker with Compose. There is no database, account or API key.

```sh
docker compose -f docker-compose.example.yml up -d --build
```

Then open http://127.0.0.1:8080 (`TOOLS_PORT=9000` in front of the command changes the port). The
port is bound to this machine only. To share it, put a reverse proxy with TLS in front.

- **No other server is contacted.** Pages, icons and pdf.js all come from the container. What you type
  or open stays in the browser.
- **Your name and icons (optional).** Copy `config/site.conf.example` to `config/site.conf`, edit it and
  rebuild. Without it, neutral icons and a neutral footer are used.
- **Without Docker.** Any static web server works: serve the `public/` folder.
- **Check it is up.** `GET /api/build` returns the hash of the served files (Docker image only).
- **Update.** Replace the files, keep `config/site.conf`, and run the command again. Nothing is stored
  on the server. Typing scores live in each browser.

Third-party material and its terms: `THIRD-PARTY-NOTICES.md`.
