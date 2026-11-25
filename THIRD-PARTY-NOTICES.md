# Third-party notices

This project is MIT (see `LICENSE`). The material below keeps its own terms.

| What | Where | Terms |
|---|---|---|
| pdf.js 3.11.174 (Mozilla) | `public/vendor/pdfjs-3.11.174/`, unmodified files from the npm package `pdfjs-dist` | Apache-2.0, full text in that folder |
| Themed dialog from octopus-kit | `public/scripts/kit-dialog.js`, `public/styles/kit-dialog.css` | MIT as declared by that package |
| EFF Long Wordlist (Joseph Bonneau, Electronic Frontier Foundation), 7,776 words | `public/scripts/eff-wordlist.js`, used by `public/password-generator.html`; dice numbers removed, words and order unchanged | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ |
| nginx and Alpine Linux | base image, pulled at build, not included here | their own licences |

pdf.js 3.11.174 predates the fix for CVE-2024-4367. `public/scripts/main.js` opens files with
`isEvalSupported: false`, the published workaround.

The EFF word list was retrieved on 2026-11-25 from
https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt, SHA-256
`addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e`. Its licence is the one EFF states at
https://www.eff.org/copyright: original material on the EFF website is under the Creative Commons
Attribution 4.0 International License unless otherwise noted. EFF's page for the lists is
https://www.eff.org/dice. EFF does not endorse this project.
