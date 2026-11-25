# Third-party notices

| What | Where | Terms |
|---|---|---|
| pdf.js 3.11.174 (Mozilla) | `public/vendor/pdfjs-3.11.174/`, unmodified files from the npm package `pdfjs-dist` | Apache-2.0, full text in that folder |
| Themed dialog from octopus-kit | `public/scripts/kit-dialog.js`, `public/styles/kit-dialog.css` | MIT as declared by that package |
| Password word list | `public/password-generator.html` | Described in the source as a subset of the EFF short word list; EFF material is CC BY (Electronic Frontier Foundation, https://www.eff.org/dice) |
| nginx and Alpine Linux | base image, pulled at build, not included here | their own licences |

pdf.js 3.11.174 predates the fix for CVE-2024-4367. `public/scripts/main.js` opens files with
`isEvalSupported: false`, the published workaround.
