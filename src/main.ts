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
    wrappedJSObject: any;
    filteredMarkers: Marker[];
  }
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
  min: number;
  max: number;
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
  constructor(x: Float32Array, values: Float32Array, len: number) {
    this.x = x;
    this.values = values;
    this.idx_x = len;
  }
}

/* Main data store:
 * coherent: A map of list of time series that correspond to the same X
 *           values (e.g. from the same regexp)
 * variables: all the variables currently bound. */
class Store {
  coherent: Map<string, CoherentTimeSeries>;
  variables: Map<string, Variable>;
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
  values: Float32Array | number;
}

class Variable {
  name: string;
  value: TimeSeries | number;
  scalar(): boolean {
    return typeof this.value == "number";
  }
  series(): boolean {
    return typeof this.value != "number";
  }
  as_scalar(): number {
    return this.value as number;
  }
  as_series(): TimeSeries {
    return this.value as TimeSeries;
  }
  // Return a TimeSeries that has as many points as `other`
  timeseries_from(other: TimeSeries): TimeSeries {
    if (this.series()) {
      return this.value as TimeSeries;
    }
    var values = new Float32Array(other.x.length);
    values.fill(this.value as number);
    return new TimeSeries(other.x, values, other.x.length);
  }
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

function get_initial() {
  if (document.body.classList.contains("fx-profiler-plotter-dev-shell")) {
    return initial;
  }
  return "";
}

function close_cb(e: Event) {
  e.stopPropagation();
  var root = (e.target as HTMLDivElement).parentNode.parentNode.parentNode;
  (root as HTMLDivElement).remove();
  return false;
}

declare global {
  interface HTMLDivElement {
    stashed: any;
  }
}

// minimize plots and display a summary
function minimize_cb(e: Event) {
  e.stopPropagation();
  var root = (e.target as HTMLDivElement).parentNode.parentNode
    .parentNode as HTMLDivElement;
  var summary = root.querySelector(".cb-summary-text") as HTMLDivElement;
  let minimized = (root as HTMLDivElement).classList.contains("minimized");
  if (!minimized) {
    root.stashed = root.style.height;
    root.style.height = "2em";
    root.style.resize = "none";
    summary.innerText = root.querySelector(".cm-content").textContent;
    let minimized = (root as HTMLDivElement).classList.add("minimized");
  } else {
    root.style.height = root.stashed;
    delete root.stashed;
    root.style.resize = "both";
    summary.innerText = "";
    let minimized = (root as HTMLDivElement).classList.remove("minimized");
  }
  return false;
}

// Create basic Div to display information. The page can contain multiple plots
// at the same time.
function GetGraphicRootDivs() {
  return root;
}

enum Operator {
  add,
  sub,
  mul,
  div,
}

// Perform a couple checks and then apply a math operator to each element of
// lhs and rhs, returning the result.
function arith(lhs: Variable, rhs: Variable, operator: Operator) {
  let zipf = (lhs: Float32Array, rhs: Float32Array, f: Function) =>
    lhs.map((v1, i) => f(v1, rhs[i]));

  let operators = [
    (a: number, b: number) => a + b,
    (a: number, b: number) => a - b,
    (a: number, b: number) => a * b,
    (a: number, b: number) => a / b,
  ];

  let f = operators[operator];

  if (lhs.scalar() && lhs.scalar()) {
    return f(lhs.as_scalar(), rhs.as_scalar());
  }
  let lhs_ts = lhs.scalar()
    ? lhs.timeseries_from(rhs.value as TimeSeries)
    : lhs.as_series();
  let rhs_ts = rhs.scalar()
    ? rhs.timeseries_from(lhs.value as TimeSeries)
    : rhs.as_series();

  // check if data coherent enough: same number of points, more or less the same
  // time values, second series "behind" first one
  if (lhs_ts.values.length != rhs_ts.values.length) {
    return "Error: Not same size";
  }
  let lag = lhs_ts.x[0] - rhs_ts.x[0];
  if (lag < 0) {
    return "Error: right hand side earlier than left hand side";
  }
  let ONE_MS = 0.001;
  if (lag > ONE_MS) {
    return "Error: left and right hand side further than 1ms apart";
  }

  return zipf(lhs_ts.values, rhs_ts.values, f);
}

function display_error(str: string) {
  console.warn(str);
}

function stats(values: Float32Array) {
  var result = {} as StatsResult;
  let copy_values = values.slice(0);
  copy_values.sort((a, b) => a - b);
  result.median = copy_values[Math.floor(copy_values.length / 2)];
  var sum = values.reduce((sum, next) => sum + next);
  result.mean = sum / values.length;

  // Variance
  result.variance = 0;
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    result.variance += Math.pow(values[i] - result.mean, 2);
    if (min > values[i]) {
      min = values[i];
    }
    if (max < values[i]) {
      max = values[i];
    }
  }
  result.variance /= values.length;

  // Standard deviation
  result.stddev = Math.sqrt(result.variance);
  result.min = min;
  result.max = max;

  return result;
}

function plot_multiple(series: Variable[], root: Element) {
  var graphed_series = [] as Plotly.PlotData[];
  series.forEach((s, name) => {
    // Plot scalar differently, in the layout
    if (s.scalar()) {
      return;
    }
    let ts = s.as_series();
    graphed_series.push({
      x: ts.x,
      y: ts.values,
      name: s.name,
      type: "scatter",
    });
  });
  var shapes = [];
  series.forEach((s, name) => {
    if (s.series()) {
      return;
    }
    shapes.push({
      type: "line",
      xref: "paper",
      x0: 0,
      y0: s.as_scalar(),
      x1: 1,
      y1: s.as_scalar(),
      line: {
        color: "rgb(255, 0, 0)",
        width: 1,
        dash: "dot",
      },
    });
  });
  var layout = {
    title: `Values of ${Array.from(series.map((s) => s.name)).join(", ")}`,
    xaxis: {
      exponentformat: "none",
    },
    yaxis: {
      exponentformat: "none",
    },
    shapes: shapes,
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

function handle_processing(
  processing: Processing,
  variables: Map<string, Variable>,
  root: Element,
): Variable | string {
  let args_name = processing.args.split(",").map((v) => v.trim());
  var inputs = [];
  args_name.forEach((e) => {
    inputs.push(variables.get(e));
  });

  var plotRoot = html("div", []);
  let rv = new Variable();
  switch (processing.operator) {
    case "integral": {
      if (inputs.length != 1) {
        throw "Error, integral only support one argument";
      }
      let values = inputs[0].value as TimeSeries;
      var integrated = new Float32Array(values.x.length);
      var integral = 0;
      for (var i = 0; i < values.x.length; i++) {
        integral += values[i];
        integrated[i] = integral;
      }
      rv.name = processing.assignment;
      rv.value = new TimeSeries(values.x, integrated, values.x.length);
      if ($(".autoplot").checked) {
        plot_simple(
          `Integral of ${processing.args}`,
          values.x,
          integrated,
          plotRoot,
        );
      }
      break;
    }
    case "derivative": {
      if (inputs.length != 1) {
        throw "Error, derivative only support one argument";
      }
      let values = inputs[0].as_series();
      var differentiated = new Float32Array(values.x.length);
      differentiated[0] = 0;
      for (var i = 1; i < values.x.length; i++) {
        differentiated[i] = values[i] - values[i - 1];
      }
      rv.name = processing.assignment;
      rv.value = new TimeSeries(values.x, differentiated, values.x.length);

      if ($(".autoplot").checked) {
        plot_simple(
          `Derivative of ${processing.args}`,
          x,
          differentiated,
          plotRoot,
        );
      }
      break;
    }
    case "histogram":
      let traces = [];
      inputs.forEach((v) =>
        traces.push({ x: v.value.values, type: "histogram", name: v.name }),
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
      let values = inputs[0].value;
      var sum = values.reduce((sum: number, next: number) => sum + next);
      plotRoot.innerHTML = `Sum of ${processing.args}: ${sum}`;
      rv.name = processing.assignment;
      rv.value = sum;
      break;
    }
    case "stats": {
      let series = inputs[0].as_series();
      let result = stats(series.values);

      plotRoot.innerHTML = `
      <h2>Stats for ${processing.args}:</h2>
      <table>
      <tr><td> Mean</td><td> ${result.mean.toPrecision(4)}</td></tr>
      <tr><td> Median</td><td> ${result.median.toPrecision(4)}</td></tr>
      <tr><td> Variance</td><td> ${result.variance.toPrecision(4)}</td></tr>
      <tr><td> Standard deviation</td><td> ${result.stddev.toPrecision(4)}</td></tr>
      <tr><td> Minimum </td><td> ${result.min.toPrecision(4)}</td></tr>
      <tr><td> Maximum </td><td> ${result.max.toPrecision(4)}</td></tr>
      </table>`;
      break;
    }
    case "plot": {
      plot_multiple(inputs, plotRoot);
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
      var x = inputs[0].as_series().x;
      rv.name = processing.assignment;
      rv.value = new TimeSeries(x, resultArray, x.length);
      break;
    }
    case "median": {
      if (processing.assignment) {
        let result = stats(inputs[0].as_series().values);
        rv.name = processing.assignment;
        rv.value = result.median;
      }
    }
    case "mean": {
      if (processing.assignment) {
        rv.name = processing.assignment;
        let result = stats(inputs[0].as_series().values);
        rv.value = result.mean;
      }
    }
    case "geomean": {
      if (processing.assignment) {
        let v = inputs[0].as_series().values;
        var logSum = v.reduce((v: number, s: number) => (s += Math.log(v)));
        rv.name = processing.assignment;
        rv.value = Math.exp(logSum / v.length);
      }
    }
    case "max": {
      if (processing.assignment) {
        rv.name = processing.assignment;
        rv.value = Math.max(...inputs[0].as_series().values);
      }
    }
    case "min": {
      if (processing.assignment) {
        rv.name = processing.assignment;
        rv.value = Math.min(...inputs[0].as_series().values);
      }
    }
    case "stddev": {
      if (processing.assignment) {
        rv.name = processing.assignment;
        let result = stats(inputs[0].as_series().values);
        rv.value = result.stddev;
      }
    }
    case "variance": {
      if (processing.assignment) {
        rv.name = processing.assignment;
        let result = stats(inputs[0].as_series().values);
        rv.value = result.variance;
      }
    }
    case "percentile": {
      if (processing.assignment) {
        rv.name = processing.assignment;

        let percentile = inputs[1].as_scalar();
        if (percentile < 1 || percentile > 99) {
          throw new Error("Percentile must be between 1 and 99");
        }
        const sorted = inputs[0].as_series().values.slice().sort();
        const index = (percentile / 100) * (sorted.length + 1);
        if (Math.floor(index) === index) {
          rv.value = (sorted[index - 1] + sorted[index]) / 2;
        } else {
          rv.value = sorted[Math.floor(index) - 1];
        }
      }
    }
    default:
      console.error(`!?!?! unknown ${processing.operator} operator`);
      break;
  }
  root.appendChild(plotRoot);
  return rv;
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

function get_data_from_matchers(spec: PlottingSpec, charts_root: Element) {
  var root = charts_root.parentNode.parentNode;
  charts_root.innerHTML = "";
  var m: Marker[];
  if (window.wrappedJSObject) {
    m = window.wrappedJSObject.filteredMarkers;
  } else {
    m = window.filteredMarkers;
  }
  var store = new Store();
  store.coherent = new Map<string, CoherentTimeSeries>();
  store.variables = new Map<string, Variable>();
  var coherent = store.coherent;

  /* Match the regexp, outputing time series. */
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
  // run regexp on each marker, using the matched value, duration or start time
  // as Y value, and the start time as X value
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
    console.warn("No point matched");
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
      let v = new Variable();
      v.name = name;
      v.value = t;
      store.variables.set(name, v);
    });
  });

  if ((root.querySelector(".autoplot") as HTMLInputElement).checked) {
    plot(store.coherent, charts_root);
  }

  while (spec.processing.length) {
    var processing = spec.processing.shift();
    let input_names = processing.args.split(",").map((e) => e.trim());
    let inputs = [];
    input_names.forEach((s) => {
      // Check if the value is a numeric constant, in which case, add it as a variable.
      let constant = parseFloat(s);
      let v = new Variable();
      if (!Number.isNaN(constant)) {
        v.name = s;
        v.value = constant;
        store.variables.set(s, v);
      }
      if (!store.variables.get(s)) {
        console.warn(`variable ${s} not found, typo?`);
      }
    });
    var output = handle_processing(processing, store.variables, charts_root);
    if (typeof output == "string") {
      console.error(output);
      continue;
    }
    let valid_output = output as Variable;
    if (output.name) {
      let v = new Variable();
      v.name = output.name;
      if (output.scalar()) {
        v.value = output.value as number;
      } else {
        v.value = valid_output.as_series();
      }
      store.variables.set(output.name, v);
    }
  }

  if ((root.querySelector(".view_variables") as HTMLInputElement).checked) {
    function readable(v: Variable) {
      if (v.scalar()) {
        return v.as_scalar();
      }
      return `[f32;${v.as_series().x.length}]`;
    }
    var variables = root.querySelector(".variables");
    var str = "Variables:";
    str += "<table><thead><th>Name</th><th>Value</th></thead><tbody>";
    store.variables.forEach((v) => {
      str += `<tr><td>${v.name}</td><td>${readable(v)}</td></tr>`;
    });
    str += "<tbody></table>";
    variables.innerHTML = str;
  } else {
    root.querySelector(".variables").innerHTML = "";
  }
}

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
        /(?:([a-zA-Z0-9_]+)? ?= ?)?([a-zA-Z0-9]+)[(]([a-zA-Z0-9:., _]+)[)]/;

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
        console.log(args);
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
        "median",
        "mean",
        "geomean",
        "max",
        "min",
        "stddev",
        "variance",
        "percentile",
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

function doit(target: EditorView): boolean {
  let root = target.dom.parentNode.parentNode.parentNode;
  const content: string = target.state.doc.toString();
  const chartRoot = root.querySelector(".charts");
  var spec = parse_spec(content);
  get_data_from_matchers(spec, chartRoot);
  return true;
}

function openExtension() {
  // root: where to insert elements
  var root = html("div", ["cb-root"]);
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

  document.body.appendChild(root);

  var options = {
    grid: 10,
    onDragStart: function () {
      root.classList.add("dragged");
    },
    onDragEnd: function () {
      root.classList.remove("dragged");
    },
    handle: drag,
    filterTarget(e: Event) {
      return !(e.target as HTMLDivElement).classList.contains("cb-action");
    },
  };

  new Draggable(root, options);

  let main = html("div", ["cb-main"], root);
  var autoplot = html("input", ["autoplot"], main);
  (autoplot as HTMLInputElement).type = "checkbox";
  var autoplotLabel = html("label", []);
  autoplotLabel.innerText = "Automaticaly plot from regular expression";
  (autoplotLabel as HTMLLabelElement).htmlFor = "autoplot";
  main.appendChild(autoplotLabel);

  var view_variables = html("input", ["view_variables"], main);
  (view_variables as HTMLInputElement).type = "checkbox";
  (view_variables as HTMLInputElement).checked = true;
  var view_variablesLabel = html("label", []);
  view_variablesLabel.innerText = "View variables";
  (view_variablesLabel as HTMLLabelElement).htmlFor = "view_variables";
  main.appendChild(view_variablesLabel);

  var editor_and_variables = html("div", ["editor-and-variables"], main);
  var input = html("div", ["editor"], editor_and_variables);
  var variables = html("div", ["variables"], editor_and_variables);
  var charts = html("div", ["charts"], main);

  new EditorView({
    state: EditorState.create({
      doc: get_initial(),
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
