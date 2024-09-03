# `fx-profiler-plotter`

![The extension icon, weird data plotted on hand-draw xy axis](https://raw.githubusercontent.com/padenot/fx-profiler-plotter/master/icons/icon2x.png)

Plot and analyze [Firefox profiler](https://profiler.firefox.com/).

# Installation

Install the latest `.xpi` from the `dist` directory. This is signed by
<https://addons.mozilla.org>.

# Usage

The syntax is split in two parts: matchers and processing

## Matchers, auto-plotting

The matchers are a list of javascript regular expressions, one per line.
Matching numbers is done by using `##name`, in which `name` is the name of a
particular time series, that can be displayed or processed in a later stage.

When matching lines that doesn't contain numbers, the variable name is the
regular expression, and the value is the duration of each marker, if there is
one, or its start time otherwise. For example:

### Examples

```
Popping ##frames frames. Remaining in ringbuffer ##remaining / ##total
budget
Unprocessed
```

is going to bind five variables like so:

- `frames`, `remaining`, `total` have the values matched in `y`, the start time of the marker in `x`
- `budget` will hold the duration of the markers `AudioStream real-time budget` in `y`, the start time of the marker in `x`
- `DataCallback` will hold the duration of the markers `AudioStream::DataCallback` in `y` and the start time of the marker in `x`

It is possible to automatically plot time series by ticking the only checkbox
available. In this case, they are grouped per matcher. It is also possible to be
more explicit, using the processing section.

## Processing

The processing section allows taking time series and constants as input, and
produce time series and scalar values as output. Some functions are available:

|function|description|return value type|
|---|---|----|
| `plot(series1, series2, ...)`| plot the series, on the same chart | none |
| `histogram(series1, series2, ...)`| display histograms of the data | none |
| `stats(series)`| display simple stats (mean, median, etc.) | none |
| `integral(series)`| each value is added to all previous values | time series |
| `derivative(series)`| each value is subtracted to the previous value | time series |
| `add(a, b)`| add points, return a new series | time series |
| `sub(a, b)`| subtract points, return a new series | time series |
| `mul(a, b)`| multiply points, return a new series | time series |
| `div(a, b)`| divide points, return a new series | time series |
| `sum(a, b)`| outputs the sum of all values | scalar |
| `max(series)`| outputs the max of all values | scalar |
| `min(series)`| outputs the min of all values | scalar |
| `stddev(series)`| outputs the standard deviantion the series | scalar |
| `variance(series)`| outputs the variance of the series | scalar |
| `mean(series)`| outputs the average (mean) of the series | scalar |
| `geomean(series)`| outputs the geometric mean of the series | scalar |
| `median(series)`| outputs the media the series | scalar |
| `percentile(series, v)`| outputs the `v`th percentile of the series | scalar |

Arithmetic between series, must have same number of point, and be at
roughly the same time.

Constants and scalars are expanded to a time series that has the same number of
points as the other series.

### Example:

Plot some simple statistics about media playback audio clock and ringbuffer
fullness:

```
Audio Sink ##position
Popping ##request frames. Remaining in ringbuffer ##remaining

diff = derivative(position)
integral(frames)
histogram(remaining)
histogram(diff)
stats(diff)
```

Plot real-time audio callback load during media playback:

```
budget
Unprocessed

load = div(Unprocessed, budget)
percent_load = mul(load, 100)
stats(percent_load)
plot(percent_load)
histogram(percent_load)
```

# Development

Source is in `/src/main.js`. Build with `npm run build`. When developing,
`npm run dev` allows running a simple web server, with a page with sample data
(from real Firefox Profiler profiles), to speed things up.

Otherwise, after building, install
[`webext-run`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/),
and run `web-ext run` in the top level directory.


# TODO

- heatmaps / buffered

# License

MPL 2.0
