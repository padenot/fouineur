---
title: Fouineur
subtitle: A Firefox extension for the Firefox Profiler
author: Paul Adenot
author-url: "https://paul.cx"
email: <padenot@mozilla.com>
date: 2024-09-07
lang: en
version: v0.0.1
---

---

<div class=definition>
**French**

**Etymology**: from [_fouiner_](https://en.wiktionary.org/wiki/fouiner#French) \+‎ [_\-eur_](https://en.wiktionary.org/wiki/-eur#French).<br>
**Pronunciation**: [IPA](https://en.wiktionary.org/wiki/Wiktionary:International_Phonetic_Alphabet)([key](https://en.wiktionary.org/wiki/Appendix:French_pronunciation)): /fwi.nœʁ/<br>
**Noun**: **fouineur** m (_plural_ [**fouineurs**](https://en.wiktionary.org/wiki/fouineurs#French), _feminine_ [**fouineuse**](https://en.wiktionary.org/wiki/fouineuse#French))<br>

1. [busybody](https://en.wiktionary.org/wiki/busybody#English), [meddler](https://en.wiktionary.org/wiki/meddler#English), [nosy](https://en.wiktionary.org/wiki/nosy#English) person
2. ([computing](https://en.wiktionary.org/wiki/computing#Noun), [rare](https://en.wiktionary.org/wiki/Appendix:Glossary#rare)) [hacker](https://en.wiktionary.org/wiki/hacker#English)
</div>

---

# Downloads & install

First things first: source is available at <https://github.com/padenot/fouineur>,
and installing is done by grabbing the latest version from the
[`signed/`](https://github.com/padenot/fouineur/tree/main/signed)
directory.

# Introduction

This extension allows computing statistics and plotting data from [Firefox
Profiler](https://profiler.firefox.com) markers, specifically all the markers
shown on the Marker Chart (this works when multiple threads are selected).

<picture style="max-height: 75vh;">
  <source srcset="./fouineur-shot.avif" type="image/avif">
  <source srcset="./fouineur-shot.jpg" type="image/jpeg">
  <img src="./fouineur-shot.jpg" alt="A screenshot of the interface">
</picture>

Given a set of regular expressions, one per line, called **"matchers"** time
series are either plotted directly, or made available for further processing.
This is done by writing statements in a small domain specific language, in a
section separated from the matchers by an empty line.

```
// Sample program

matcher1 ##variable // comments like this
matcher2

processing = derivative(variable)
```

Opening a panel is done by clicking on its icon in the usual location on the
Firefox tool bar, when on any Firefox Profiler page.

After having written a program, run it by hitting `ctrl+enter`, and save it
with familiar icons. If a program has been saved before, running it saves it.

It is possible to have multiple instances opened at the same time, and to drag,
minimize and resize each window, for example to have multiple visualization at
once. Changing the thread selection doesn't impact a panel, unless its program
is re-run.

# Matchers, auto-plotting

Time series are list of `(x,y)` paris of numbers. `x` is a time value,
corresponding to the start time of a event, and `y` can be any value, including
a duration, a count of something, a ratio, etc.

**Matchers** are a list of string that can match marker names,
one per line. If a matcher matches a marker name or data payload, its duration,
or in the case of markers without duration, its start time, is stored in a time
series: in `x`, the start time of the marker, in `y`, either the time of the
marker, or its duration.

```
RequestAnimationFrame
```

will produce a time series containing the time `requestAnimationFrame` callbacks
are called in `x`, and the duration of each `requestAnimationFrame` callback in
`y`.

Markers often contain numbers in their payload. It is possible to capture those
values over time, and create time series:

```
Audio Sink ##position
```

will match the following set of markers:

```
Audio Sink 0.01
Audio Sink 0.03
Audio Sink 0.06
Audio Sink 0.08
...
```

and store the value in a time series called `position`. This time series will
have the marker start in `x`. `##name` is macro-expanded to `(-?[0-9.]+)`.

Sometimes it is desirable to match exactly a marker, it is possible to do so
using double-quotes:

```
RefreshDriverTick
```

will match `RefreshDriverTick` and `RefreshDriverTick waiting for paint`, but:

```
"RefreshDriverTick"
```

will only match `RefreshDriverTick`. The name of the time series will _not_
include the double-quotes.

## Examples

```
Popping ##frames frames. Remaining in ringbuffer ##remaining / ##total
budget
DataCallback
```

is going to bind five variables like so:

- `frames`, `remaining`, `total` have the values matched in `y`, the start time of the marker in `x`
- `budget` will hold the duration of the markers `AudioStream real-time budget` in `y`, the start time of the marker in `x`
- `DataCallback` will hold the duration of the markers `AudioStream::DataCallback` in `y` and the start time of the marker in `x`

It is possible to automatically plot time series by ticking a checkbox on top of
the editor available. In this case, they are grouped per matcher. It is also
possible to be more explicit, using the processing section.

# Processing

The processing section allows taking time series and scalars as input, and
produce time series and scalar values as output. Some functions are available, `ts`
meaning "time series":

| function      | arity | input        | output | description                                               |
| ------------- | ----- | ------------ | ------ | --------------------------------------------------------- |
| `plot`        | `n`   | `ts`, scalar | none   | plot the series, on the same chart                        |
| `histogram`   | `n`   | `ts`         | none   | display histograms of the data                            |
| `histoprob`   | `n`   | `ts`         | none   | display histograms of the data, normalized                |
| `histlog`     | `n`   | `ts`         | none   | display histograms of the data, log `y` axis              |
| `stats`       | 1     | `ts`         | none   | display simple stats (mean, median, etc.)                 |
| `integral`    | 1     | `ts`         | `ts`   | each value is added to all previous values                |
| `derivative`  | 1     | `ts`         | `ts`   | each value is subtracted to the previous value            |
| `start_times` | 1     | `ts`         | `ts`   | extract the start times of a time series as a time series |
| `add`         | 2     | `ts`, scalar | `ts`   | add points, return a new series                           |
| `sub`         | 2     | `ts`, scalar | `ts`   | subtract points, return a new series                      |
| `mul`         | 2     | `ts`, scalar | `ts`   | multiply points, return a new series                      |
| `div`         | 2     | `ts`, scalar | `ts`   | divide points, return a new series                        |
| `sum`         | `n`   | `ts`         | scalar | outputs the sum of all values                             |
| `max`         | 1     | `ts`         | scalar | outputs the max of all values                             |
| `min`         | 1     | `ts`         | scalar | outputs the min of all values                             |
| `stddev`      | 1     | `ts`         | scalar | outputs the standard deviation the series                 |
| `variance`    | 1     | `ts`         | scalar | outputs the variance of the series                        |
| `mean`        | 1     | `ts`         | scalar | outputs the average (mean) of the series                  |
| `geomean`     | 1     | `ts`         | scalar | outputs the geometric mean of the series                  |
| `median`      | 1     | `ts`         | scalar | outputs the media the series                              |
| `percentile`  | 2     | `ts`, scalar | scalar | outputs the `v`th percentile of the series                |

Arithmetic between series must have same number of point, and be at
roughly the same time: if two markers have been output close in time, they are
considered to be on coherent timelines, and arithmetic is allowed.

Constants and scalars are expanded to a time series that has the same number of
points as the other series, when used in combinations with time series. For
example, the following works and will print the ratio of the duration of the
markers `DataCallback` and `budget`, multiplied by 100, and then displayed as a
time series:

```
DataCallback
budget

load = div(DataCallback, budget)
percent = mul(load, 100)
plot(percent)
```

Multiple series or scalars can be displayed on the same graph:

```
DataCallback
budget

load = div(DataCallback, budget)
percent = mul(load, 100)
ninefive = percentile(percent, 95)
// plot the load in percent, the 95th percentile and a line at 50% load
plot(percent, ninefive, 50)
```

Scalars are displayed with a dashed red line.

# Examples

Plot some simple statistics about media playback audio clock jitter and
ring-buffer fullness, as long as total frames played:

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

Analyse a `requestAnimationFrame` drawing loop, e.g. a javascript program
drawing on a 2d canvas (try it on <https://share.firefox.dev/47mbjda>):

```
// Match two markers: requestAnimationFrame, and the total rendering tick
requestAnimationFrame
"RefreshDriverTick"

// Plot those two, and a scalar that is the budget at 60Hz
plot(requestAnimationFrame, RefreshDriverTick, 16.6)
// Compute the overhead: the time spent by user code
// (requestAnimationFrame) as a proportion of each draw tick
overhead = div(requestAnimationFrame, RefreshDriverTick)
overheadpercent = mul(overhead, 100)
plot(overheadpercent)
// Compute the derivative of the requestAnimationFrame duration: this shows
// how real-time-safe the user code is: is it roughly taking the same time each
// callback, and when not, when does that happen, to then further dig in the
// other profiler view. Plot a histogram and useful statistics for this
// distribution.
diff = derivative(requestAnimationFrame)
plot(diff)
histlog(diff) // histogram with log for the y axis to surface the outli
stats(diff)
// Extract the start time of each driver tick, compute the derivative to get a
// sense of the rendering jitter
starts = start_times(RefreshDriverTick)
startsdiff = derivative(starts)
plot(startsdiff)
```
