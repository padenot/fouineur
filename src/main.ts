import Plotly from "plotly.js-cartesian-dist";
import { EditorView, minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap, placeholder } from "@codemirror/view";
import Draggable from "draggable";

// DOM management utility functions
var $ = document.querySelector.bind(document);
var $$ = document.querySelectorAll.bind(document);

function html(
  name: string,
  classList: string[],
  parent?: HTMLElement,
): HTMLElement {
  var e = document.createElement(name);
  classList.forEach((c) => e.classList.add(c));
  if (parent) {
    parent.appendChild(e);
  }
  return e;
}

// Expando for extensions + Firefox profiler expandos
declare global {
  interface Window {
    _mainExpando: RootObject;
    wrappedJSObject: any;
    filteredMarkers: Marker[];
  }
}
interface Window {
  _mainExpando: RootObject;
}

/* Firefox Profiler declarations, translated from flow */
interface MarkerData {
  key: string;
  label?: string;
  format: string;
  searchable?: boolean;
}
interface MarkerKV {
  label: string;
  value: string;
}
interface MarkerPayload {
  name: string;
  tooltipLabel?: string;
  tableLabel?: string;
  chartLabel?: string;
  display: string[];
  data: MarkerData | MarkerKV;
  graphs?: string;
}
interface Marker {
  start: number;
  end?: number;
  name: string;
  category: number;
  threadId?: number;
  data: MarkerPayload;
  incomplete?: boolean;
}

/** internal interfaces */

/* What it says */
class StatsResult {
  median: number;
  mean: number;
  stddev: number;
  variance: number;
}

/* An object to store items to be accessed from the top scope */
class RootObject {
  editor: EditorView;
  rootDiv: Element;
}

/* Multiple time series that have the same x, likely matched
 * from a single regexp */
class CoherentTimeSeries {
  x: Float32Array;
  values: Map<string, Float32Array>;
  idx_x: number;
  time_base: number;
}

/* A list of values with their time value in x. idx_x is values.length. */
class TimeSeries {
  x: Float32Array;
  values: Float32Array;
  idx_x: number;
}

/* Main data store:
 * coherent: A map of list of time series that correspond to the same X
 *           values (e.g. from the same regexp)
 * flat: The same data but flattened. */
class Store {
  coherent: Map<string, CoherentTimeSeries>;
  flat: Map<string, TimeSeries>;
}

/* Represents a processing: an operator, arguments, and
 * an optional name to assign the result. */
class Processing {
  operator: string;
  args: string;
  assignment?: string;
}

/* A matcher is a regexp, and a set of label corresponding to
 * match groups in the regexp. */
class Matcher {
  regexp: string;
  labels: string[];
}

/* Representation of the parsed plotting specification: a list
 * of matchers (regexp), and a list of processing to apply. */
class PlottingSpec {
  matchers: Matcher[];
  processing: Processing[];
}

/* Represents an assignemnt when processing, e.g.:
 * diff = derivative(position) */
class Assignment {
  name: string = "";
  x: Float32Array;
  values: Float32Array;
}

var PLACEHOLDER = `
  first regexp ##numericvariable
  second regexp ##numericvariable2

  histogram(numericavariable)
  integral(numericvariable)
  diff = derivative(numericvariable2)
  histogram(diff)
  stats(numericvariable)
  `;

var initial2 = `Popping ##frames frames. Remaining in ringbuffer ##remaining / ##total
Audio Sink ##position

plot(frames, remaining)
diff = derivative(position)
integral(frames)
histogram(remaining)
histogram(diff)
stats(diff)
fullness = eval(remaining / total)`;

var initial = `budget
Unprocessed

load = div(Unprocessed, budget)
percent_load = mul(load, 100)
plot(percent_load)
`;

function close_cb(e: Event) {
  e.stopPropagation();
  document.querySelector(".cb-wrapper").remove();
  return false;
}

// minimize plots and display a summary
function minimize_cb(e: Event) {
  e.stopPropagation();
  var main = document.querySelector(".cb-main");
  var minimized = main.classList.toggle("minimized");
  if (minimized) {
    $(".cb-root").stashed = $(".cb-root").style.height;
    $(".cb-root").style.height = "3em";
    $(".cb-root").style.resize = "none";
    $(".cb-summary-text").innerText = $(".cm-content").textContent;
  } else {
    $(".cb-root").style.height = $(".cb-root").stashed;
    delete $(".cb-root").stashed;
    $(".cb-root").style.resize = "both";
    $(".cb-summary-text").innerText = "";
  }
  return false;
}

// Create basic Div to display information. The page can contain multiple plots
// at the same time.
function GetGraphicRootDivs() {
  var rootWrapper = document.getElementById("cb-wrapper");
  var root = document.getElementById("cb-root");
  if (!rootWrapper || !root) {
    // wrapper: for style
    rootWrapper = html("div", ["cb-wrapper"]);
    // root: where to insert elements
    root = html("div", ["cb-root"], rootWrapper);
    // drag thumb
    var drag = html("div", ["cb-drag"], root);
    var title = html("h1", ["cb-title"], drag);
    title.innerText = "ploti";
    var summary = html("div", ["cb-summary"], drag);
    var summary_text = html("div", ["cb-summary-text"], summary);

    let actions = html("div", ["cb-actions"], drag);

    // minimize button
    let minimize = html("div", ["cb-action"], actions);
    minimize.innerText = "🗕";
    minimize.addEventListener("click", minimize_cb);

    // close button
    let close = html("div", ["cb-action"], actions);
    close.innerText = "✖️";
    close.addEventListener("click", close_cb);

    document.body.appendChild(rootWrapper);

    var options = {
      grid: 10,
      onDragStart: function () {
        rootWrapper.classList.add("dragged");
      },
      onDragEnd: function () {
        rootWrapper.classList.remove("dragged");
      },
      handle: drag,
      filterTarget(e) {
        return !e.classList.contains("cb-action");
      },
    };
    new Draggable(root, options);
  }
  return {
    rootWrapper,
    root,
  };
}

enum Operator {
  add,
  sub,
  mul,
  div,
}

// Perform a couple checks and then apply a math operator to each element of
// lhs and rhs, returning the result.
function arith(lhs: TimeSeries, rhs: TimeSeries, operator: Operator) {
  // check if data coherent enough
  if (lhs.x.length != rhs.x.length) {
    return "Error: Not same size";
  }
  let lag = lhs.x[0] - rhs.x[0];
  if (lag < 0) {
    return "Error: right hand side earlier than left hand side";
  }
  let ONE_MS = 0.001;
  if (lag > ONE_MS) {
    return "Error: left and right hand side further than 1ms apart";
  }

  let zipf = (lhs: Float32Array, rhs: Float32Array, f: Function) =>
    lhs.map((v1, i) => f(v1, rhs[i]));

  let operators = [
    (a: number, b: number) => a + b,
    (a: number, b: number) => a - b,
    (a: number, b: number) => a * b,
    (a: number, b: number) => a / b,
  ];

  let f = operators[operator];

  let len = lhs.x.length;
  let rv = new Float32Array(len);
  return zipf(lhs.values, rhs.values, f);
}

function display_error(str: string) {
  console.warn(str);
}

function handle_processing(
  processing: Processing,
  data: (TimeSeries|number)[],
  root: Element,
): Assignment | undefined | string {
  function plot_multiple(
    names: Array<string>,
    series: TimeSeries[],
    root: Element,
  ) {
    var graphed_series = [] as Plotly.PlotData[];
    series.forEach((s, i) => {
      graphed_series.push({
        x: s.x,
        y: s.values,
        name: names[i],
        type: "scatter",
      });
    });
    var layout = {
      title: `Values of ${names.join(", ")}`,
      xaxis: {
        exponentformat: "none",
      },
      yaxis: {
        exponentformat: "none",
      },
    };
    Plotly.newPlot(root, graphed_series, layout, { responsive: true });
  }
  // Plot y agains x
  function plot_simple(
    name: string,
    x: Float32Array,
    y: Float32Array,
    root: Node,
  ) {
    var series = [
      {
        x: x,
        y: y,
        name: name,
        type: "scatter",
      },
    ];
    var layout = {
      title: name,
      xaxis: {
        exponentformat: "none",
      },
      yaxis: {
        exponentformat: "none",
      },
    };
    Plotly.newPlot(root, series, layout, { responsive: true });
  }

  // turn constant into arrays of right size
  let expanded : TimeSeries[];
  let args_name = processing.args.split(",").map((v) => v.trim());
  // Split constants and series
  let constants = new Map<string, number>;
  let series = new Map<string, TimeSeries>;
  data.forEach((e, i) => {
    if (typeof e == "number") {
      constants.set(args_name[i], e as number);
    } else {
      series.set(args_name[i], e as TimeSeries);
    }
  });

  // We need at least one series
  if (series.size == 0) {
    return "Need at least one series to do something with an operator";
  }


  // We need values for x. Arbitrarily use the first time series
  let constant_expanded = series;
  let first_series = constant_expanded.entries().next().value[1];
  constants.forEach((c) => {
    let ts = new TimeSeries;
    ts.idx_x = first_series.idx_x;
    ts.x = first_series.x;
    ts.values = new Float32Array(ts.x.length);
    ts.values.fill(c);
    constant_expanded.set(c.toString(), ts);
  });

  var inputs = [];
  // Put the array in the same order as the args:
  args_name.forEach((arg) => {
    inputs.push(constant_expanded.get(arg));
  });

  var plotRoot = html("div", []);
  let has_assignment = false;
  let rv = new Assignment();
  switch (processing.operator) {
    case "integral": {
      if (inputs.length != 1) {
        throw "Error, integral only support one argument";
      }
      let values = inputs[0].values;
      var integrated = new Float32Array(values.length);
      var integral = 0;
      for (var i = 0; i < values.length; i++) {
        integral += values[i];
        integrated[i] = integral;
      }
      var x = inputs[0].x;
      if (processing.assignment) {
        has_assignment = true;
        rv.name = processing.assignment;
        rv.x = x;
        rv.values = integrated;
      }
      plot_simple(`Integral of ${processing.args}`, x, integrated, plotRoot);
      break;
    }
    case "derivative": {
      if (inputs.length != 1) {
        throw "Error, derivative only support one argument";
      }
      let values = inputs[0].values;
      var differentiated = new Float32Array(values.length);
      differentiated[0] = 0;
      for (var i = 1; i < values.length; i++) {
        differentiated[i] = values[i] - values[i - 1];
      }
      var x = inputs[0].x;
      if (processing.assignment) {
        has_assignment = true;
        rv.name = processing.assignment;
        rv.x = x;
        rv.values = differentiated;
      }
      plot_simple(
        `Derivative of ${processing.args}`,
        x,
        differentiated,
        plotRoot,
      );
      break;
    }
    case "histogram":
      let traces = [];
      let series_name = processing.args.split(",").map((v) => v.trim());
      inputs.forEach((d, i) =>
        traces.push({ x: d.values, type: "histogram", name: series_name[i] }),
      );
      var layoutHist = {
        title: `Histogram of ${processing.args}`,
        xaxis: {
          exponentformat: "none",
        },
      };
      Plotly.newPlot(plotRoot, traces, layoutHist, { responsive: true });
      break;
    case "sum": {
      let values = inputs[0].values;
      var sum = values.reduce((sum, next) => sum + next);
      plotRoot.innerHTML = `Sum of ${processing.args}: ${sum}`;
      break;
    }
    case "stats": {
      var result = {} as StatsResult;
      let values = inputs[0].values;
      let copy_values = values.slice(0);
      copy_values.sort((a, b) => a - b);
      result.median = copy_values[Math.floor(copy_values.length / 2)];
      var sum = values.reduce((sum, next) => sum + next);
      result.mean = sum / values.length;

      // Variance
      result.variance = 0;
      for (let i = 0; i < values.length; i++) {
        result.variance += Math.pow(values[i] - result.mean, 2);
      }
      result.variance /= values.length;

      // Standard deviation
      result.stddev = Math.sqrt(result.variance);

      plotRoot.innerHTML = `
      <h2>Stats for ${processing.args}:</h2>
      <table>
      <tr><td> Mean</td><td> ${result.mean.toPrecision(4)}</td></tr>
      <tr><td> Median</td><td> ${result.median.toPrecision(4)}</td></tr>
      <tr><td> Variance</td><td> ${result.variance.toPrecision(4)}</td></tr>
      <tr><td> Standard deviation</td><td> ${result.stddev.toPrecision(4)}</td></tr>
      </table>`;
      break;
    }
    case "plot": {
      let names = processing.args.split(",").map((e) => e.trim());
      plot_multiple(names, inputs, plotRoot);
      break;
    }
    case "add":
    case "sub":
    case "div":
    case "mul": {
      let names = processing.args.split(",").map((e) => e.trim());
      let op = Operator[processing.operator];
      let result = arith(inputs[0], inputs[1], op);
      if (result instanceof String) {
        display_error(result as string);
        return;
      }
      let resultArray = result as Float32Array;
      var x = inputs[0].x;
      if (processing.assignment) {
        has_assignment = true;
        rv.name = processing.assignment;
        rv.x = x;
        rv.values = resultArray;
      }
      break;
    }
    default:
      console.error(`!?!?! unknown ${processing.operator} operator`);
      break;
  }
  root.appendChild(plotRoot);
  if (has_assignment) {
    return rv;
  }
}

function plot(inputs: Map<string, CoherentTimeSeries>, root: Element) {
  inputs.forEach((series, regexp) => {
    var graphSeries = [];
    series.values.forEach((sv, name) => {
      graphSeries.push({
        x: series.x,
        y: sv,
        name: name,
        type: "scatter",
      });
    });

    var layout = {
      title: regexp,
    };

    var plotRoot = html("div", []);
    Plotly.newPlot(plotRoot, graphSeries, layout, { responsive: true });
    root.appendChild(plotRoot);
  });
}

function get_data_from_regexp(spec: PlottingSpec, charts_root: Element) {
  charts_root.innerHTML = "";
  var m: Marker[];
  if (window.wrappedJSObject) {
    m = window.wrappedJSObject.filteredMarkers;
  } else {
    m = window.filteredMarkers;
  }
  var store = new Store();
  store.coherent = new Map<string, CoherentTimeSeries>();
  store.flat = new Map<string, TimeSeries>();
  var coherent = store.coherent;

  function match_one(
    matcher: Matcher,
    marker: Marker,
    series: CoherentTimeSeries,
  ) {
    // Attempt to match both the name of the marker, and the text of the payload
    let mmatch = marker.name.match(matcher.regexp);
    let match = [];
    if (mmatch) {
      match = mmatch;
    }
    if (marker.data.name) {
      let mmatch = marker.data.name.match(matcher.regexp);
      if (mmatch) {
        match.push(...mmatch.slice(1));
      }
    }
    if (match.length) {
      if (series.time_base == -1) {
        series.time_base = marker.start;
      }
      series.x[series.idx_x] = marker.start - series.time_base;
      // No capture group, check if there's a duration. If not, use the start time
      if (match.length == 1) {
        if (marker.end) {
          let duration = marker.end - marker.start;
          series.values.get(matcher.labels[0])[series.idx_x] = duration;
        } else {
          series.values.get(matcher.labels[0])[series.idx_x] = marker.start;
        }
      } else {
        // Capture groups, use that for values
        for (var i = 0; i < match.length; i++) {
          series.values.get(matcher.labels[i])[series.idx_x] = parseFloat(
            match[i],
          );
        }
      }
      series.idx_x++;
    }
  }

  /* Match the regexp, outputing time series. Result looks like this */
  spec.matchers.forEach((e) => {
    let obj = new CoherentTimeSeries();
    // Oversize the arrays for now, they're resized later
    obj.x = new Float32Array(m.length);
    obj.idx_x = 0;
    obj.values = new Map<string, Float32Array>();
    e.labels.forEach((label: string) => {
      obj.values.set(label, new Float32Array(m.length));
    });
    obj.time_base = -1;
    coherent.set(e.regexp, obj);
  });
  // run regexp on each marker, capturing the value, inserting in Y
  for (var i = 0; i < m.length; i++) {
    spec.matchers.forEach((e) => {
      match_one(e, m[i], store.coherent.get(e.regexp));
    });
  }

  let matched = false;
  store.coherent.forEach((series, name) => {
    console.log(`${name} produced ${series.idx_x} points`);
    // Resize the arrays appropriately
    series.x = series.x.slice(0, series.idx_x);
    series.values.forEach((values, name) => {
      series.values.set(name, values.slice(0, series.idx_x));
    });
    if (series.idx_x != 0) {
      matched = true;
    }
  });
  if (!matched) {
    return;
  }

  // extract all series
  const series = new Map<string, TimeSeries>();
  coherent.forEach((series, name) => {
    series.values.forEach((values, name) => {
      let t: TimeSeries = {
        x: series.x,
        values: values,
        idx_x: series.idx_x,
      };
      store.flat.set(name, t);
    });
  });

  if ($(".autoplot").checked) {
    plot(store.coherent, charts_root);
  }

  while (spec.processing.length) {
    var processing = spec.processing.shift();
    let input_names = processing.args.split(",").map((e) => e.trim());
    let inputs = [];
    input_names.forEach((s) => {
      let constant = parseFloat(s);
      if (isNaN(constant)) {
        inputs.push(store.flat.get(s));
      } else {
        inputs.push(constant);
      }
    });
    var output = handle_processing(processing, inputs, charts_root);
    if (output) {
      let ts: TimeSeries = {
        x: output.x,
        values: output.values,
        idx_x: output.x.length,
      };
      store.flat.set(output.name, ts);
    }
  }
}

/*
 * # Language spec
 *
 * regexp use in aliases:
 * ##string: (-?[0-9.]+): a number, potentially negative, potentially
 *                        floating point, will be captured and then
 *                        put into a time series with the label "string"
 *
 * one line per regexp, but there can be multiple points (captures)
 *
 * by default: graphing time series against timestamp
 * graphing durations ?
 *
 * processing section:
 *
 * - integral(series): each value is added to all previous values
 * - derivative(series): each value is subtracted to the previous value
 * - stats(series): simple stats (mean, median, etc.)
 * - histogram(series1, series2, ...): what it says
 * - plot(series1, series2, ...): what it says
 * - map (todo)
 *
 * # Example:
 *
 * Audio Sink ##position
 * Popping ##request frames. Remaining in ringbuffer ##remaining
 *
 * diff = derivative(position)
 * integral(frames)
 * histogram(remaining)
 * histogram(diff)
 * stats(diff)
 */
function parse_spec(text: string) {
  var lines = text.split("\n");
  var state = "matchers";
  var spec = { matchers: [], processing: [] };
  lines.forEach((e: string) => {
    if (state == "matchers") {
      if (e.length == 0) {
        state = "processing";
        return;
      }
      var reg = /##([a-zA-Z0-9]+)/g;
      // Find all time series identifier, remove ##
      var labels = [...e.matchAll(reg)].map((e) => e[1]);
      var regexp_expanded = e.replace(reg, "(-?[0-9.]+)");
      // If there's no capture group, the label will be the regexp itself
      if (!labels.length) {
        labels = [e];
      }
      spec.matchers.push({
        regexp: regexp_expanded,
        labels: labels,
      });
    } else if (state == "processing") {
      // Matches:
      // aaa = bbb(ccc)
      // aaa = bbb(ccc, ddd)
      // bbb(ccc)
      var proc =
        /(?:([a-zA-Z0-9_]+)? ?= ?)?([a-zA-Z0-9]+)[(]([a-zA-Z0-9:, _]+)[)]/;

      var matches = e.match(proc);
      if (!matches) {
        return;
      }
      var assignment: string;
      var operator: string;
      var args: string;
      // no assignment
      if (matches.length == 2) {
        operator = matches[1];
        args = matches[2];
      } else {
        assignment = matches[1];
        operator = matches[2];
        args = matches[3];
      }
      const valid_operators = [
        "derivative",
        "integral",
        "sum",
        "histogram",
        "stats",
        "plot",
        "add",
        "sub",
        "mul",
        "div",
      ];
      if (!valid_operators.includes(operator)) {
        console.error(`syntax error: ${operator} isn't in ${valid_operators}`);
        return;
      }
      spec.processing.push({
        args: args,
        operator: operator,
        assignment: assignment,
      });
    }
  });
  return spec;
}

function doit(): boolean {
  let main = window._mainExpando;
  const content: string = main.editor.state.doc.toString();
  const chartRoot = main.rootDiv.querySelector(".charts");
  var spec = parse_spec(content);
  get_data_from_regexp(spec, chartRoot);
  return true;
}

window._mainExpando = {} as RootObject;

function openExtension() {
  const { rootWrapper, root } = GetGraphicRootDivs();
  let main = html("div", ["cb-main"], root);
  var autoplot = html("input", ["autoplot"], main);
  (autoplot as HTMLInputElement).type = "checkbox";
  var autoplotLabel = html("label", []);
  autoplotLabel.innerText = "Automaticaly plot from regular expression";
  (autoplotLabel as HTMLLabelElement).htmlFor = "autoplot";
  main.appendChild(autoplotLabel);

  var input = html("div", ["editor"], main);

  var charts = html("div", ["charts"], main);

  window._mainExpando.rootDiv = root;

  window._mainExpando.editor = new EditorView({
    state: EditorState.create({
      doc: initial,
      extensions: [
        placeholder(PLACEHOLDER),
        keymap.of([
          {
            key: "Ctrl-Enter",
            run: doit,
          },
        ]),
      ],
    }),
    parent: input,
  });
}

openExtension();
