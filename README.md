# `fouineur`

![The extension icon, weird data plotted on hand-draw xy axis](https://raw.githubusercontent.com/padenot/fouineur/main/icons/icon2x.png)

Plot and analyze [Firefox profiler](https://profiler.firefox.com/).

# Installation

Install the latest `.xpi` from the `dist` directory. This is signed by
<https://addons.mozilla.org>.

# Usage

See the docs at <https://padenot.github.io/fouineur>.

# Development

Source is in `/src/main.js`. Build with `npm run build`. When developing,
`npm run dev` allows running a simple web server, with a page with sample data
(from real Firefox Profiler profiles), to speed things up.

Otherwise, after building, install
[`webext-run`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/),
and run `web-ext run` in the top level directory.

`make build` and `make publish` do what they say, publish requires
<addons.mozilla.org> credentials env vars defined.

## Update custom plotly package

Provided packages of plotly are a bit too big and don't fit under the 4MB limit
of <addons.mozilla.org>. We only need `scatter` and `histogram` so we create a
custom bundle:


```sh
git clone --depth 1 https://github.com/plotly/plotly.js.git
cd plotly.js
npm i
npm run custom-bundle -- --traces scatter,histogram # adjust if need be
cp dist/plotly-custom.min.js ../dist/src/
cd ..
rm -r plotly.js
```

# TODO

- heatmaps / buffered

# License

MPL 2.0

The docs page uses a style-sheet and other resources modified from
https://github.com/owickstrom/the-monospace-web/, that is MIT licensed.
