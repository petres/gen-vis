// the types of the definitions, generated of src/schema/definition.js by `npm run types`, see scripts/types.js

export type PropEntry =
    | Value
    | {
          [k: string]: PropEntry;
      };
/**
 * A value, a reference "@name", an expression in its string syntax ("=...") or an object of an operator.
 */
export type Value = string | number | boolean | null | Expression;
/**
 * The rows of the chart: an expression of the values of the rows (`@dim`) and the globals, e.g. "@year == @globals.year and @value > 0", or the values of dims, e.g. { "year": "@globals.year" }, null removes the one of a parent.
 */
export type Filter = `=${string}` | `@${string}` | Expression | Conditions | None;
/**
 * Removes the part of a parent.
 */
export type None = null;
/**
 * The space around the plot area of a facet in pixels, of the axes and their titles, e.g. { "left": 60 }; a side without one is the one of the styles of the page (--gen-vis-margin-left: 60px, also of rem, em or pt, or auto) or of its defaults (registerDefaults, e.g. of a house style), else measured ("auto") of the labels of the axes, their tick marks and their titles; an expression of totalWidth, e.g. steps of it, also of "auto" (an expression without a value is no side).
 */
export type Margins =
    | {
          top?: NumberValue | 'auto';
          right?: NumberValue | 'auto';
          bottom?: NumberValue | 'auto';
          left?: NumberValue | 'auto';
      }
    | 'auto';
/**
 * A number, a reference "@name", e.g. to a global, or an expression, e.g. of totalWidth.
 */
export type NumberValue = number | `=${string}` | `@${string}` | Expression;
/**
 * Number and date formats, the name of a built-in locale, a language of Intl (e.g. fr or de-CH) or a d3 locale definition merged into one.
 */
export type Locale =
    | ('de' | 'en')
    | string
    | {
          /**
           * de, en or a language of Intl.
           */
          base?: string;
          /**
           * The titles of the buttons, the texts of screen readers and the name of the total of the hover.
           */
          texts?: {
              /**
               * The button of the PNG.
               */
              download?: string;
              /**
               * The button of the copy of the PNG.
               */
              copy?: string;
              /**
               * The title of the copy after a copy.
               */
              copied?: string;
              /**
               * The button of the CSV.
               */
              csv?: string;
              /**
               * The button of the SVG.
               */
              svg?: string;
              /**
               * The kind of a facet with a hover, e.g. chart.
               */
              chart?: string;
              /**
               * The description of the keys of the hover.
               */
              keys?: string;
              /**
               * The name of the row of the sum of the stacked values of the hover (hover.total true), Gesamt of de.
               */
              total?: string;
          };
          /**
           * See d3.formatLocale, e.g. decimal, thousands, grouping and currency ([prefix, suffix]).
           */
          number?: {
              [k: string]: unknown;
          };
          /**
           * See d3.timeFormatLocale, e.g. date, months and shortMonths.
           */
          time?: {
              [k: string]: unknown;
          };
          /**
           * The formats of the ticks of time axes without format, by the interval of the date.
           */
          timeTicks?: {
              millisecond?: string;
              second?: string;
              minute?: string;
              hour?: string;
              day?: string;
              week?: string;
              month?: string;
              year?: string;
          };
      };
/**
 * Moves the hover by [x, y] pixels.
 *
 * @minItems 2
 * @maxItems 2
 */
export type Pair = [number | null, number | null];
/**
 * A value of a dim, e.g. a date of a string, a reference "@name", e.g. to a global, or an expression, null is taken from the data.
 */
export type DomainValue = number | string | null | Expression;
/**
 * Extends the domain by absolute values, [start, end], the values are added.
 *
 * @minItems 2
 * @maxItems 2
 */
export type Pair1 = [number | null, number | null];
/**
 * null or false removes the part, e.g. the one of a parent.
 */
export type Removed = null | false;
/**
 * The symbol before the name of a category: auto (the default) of the marks of the categories (a box of their bars or areas, a line of their lines, a dot of their points), line, rect or circle in its color, or the svg elements, drawn in a box of width x height pixels (size both, by default the one of the defaults of the chart, 16) from 0, 0, at the middle of the capitals of the name; null (or an object without elements) is none, e.g. instead of the one of a parent.
 */
export type LegendSymbol =
    | null
    | (`=${string}` | ('line' | 'rect' | 'circle' | 'auto'))
    | {
          type: `=${string}` | ('line' | 'rect' | 'circle' | 'auto');
          size?: number;
          /**
           * The width of the box, size by default, e.g. a longer line of a dash.
           */
          width?: number;
          /**
           * The height of the box, size by default.
           */
          height?: number;
          props?: Props;
          elements?: Elements;
      }
    | SymbolElements;
/**
 * Left out, the type replaces them, e.g. the ones of a parent.
 */
export type Elements = {
    /**
     * An svg element, e.g. line or circle.
     */
    type: string;
    props?: Props;
}[];
/**
 * A key of a feature of a map or of a category, compared as a string.
 */
export type Key = string | number;

/**
 * A chart of gen-vis 5, see https://github.com/petres/gen-vis: its data, the dims of its columns, the marks drawn of them, the controls of its globals and its texts and sizes. A definition can be a part which is merged into its parent, so no entry is required.
 */
export interface GenVisDefinition {
    /**
     * The version of the definition language, the schema of gen-vis 5 (https://unpkg.com/@preschen/gen-vis@5/schema.json, also of jsdelivr, a full version, e.g. @5.0.0, or node_modules/@preschen/gen-vis/schema.json of the installed package), a definition file needs it, in itself or in a parent; a definition of gen-vis 4 is migrated when it is loaded, 'gen-vis migrate' writes it as one of gen-vis 5.
     */
    $schema?: string;
    /**
     * Url of the definition this one is deep merged into, relative to this definition, or a list of them (mixins) merged in their order, later ones override earlier ones. Lists are replaced, lists of entries with ids (marks, controls and their entries) are merged by them. A match of a global (of globals or of a control) without a default is a switch over the value of the other parts.
     */
    parent?: string | string[];
    /**
     * Url of the data, relative to the definition, CSV, TSV, JSON or parquet, by the extension or dataFormat.
     */
    data?: string;
    /**
     * The format of the data, by default the one of the extension of its url, without one parquet, CSV or JSON by the content.
     */
    dataFormat?: 'csv' | 'tsv' | 'json' | 'parquet';
    /**
     * Columns computed of the data, e.g. an index of a base year, in their order, see https://github.com/petres/gen-vis/blob/main/docs/definition.md#transform.
     */
    transform?: Transform[] | Transform;
    filter?: Filter;
    /**
     * Values the controls change, with their defaults, e.g. { "year": "2025" }; the parts of the definition refer to them in expressions ("=match(@year, ...)", "@globals.year" of a global a dim shadows) and in templates ("{year}").
     */
    globals?: {
        [k: string]: unknown;
    };
    /**
     * The controls of the globals, e.g. radio buttons of the scale or a slider over the years.
     */
    controls?: Control[];
    title?: string | InLanguages;
    subtitle?: string | InLanguages;
    /**
     * The source of the data below the chart, HTML, e.g. a link, a template of the globals, their values are text.
     */
    source?: string | InLanguages;
    /**
     * The height of a facet in pixels, 400 by default, e.g. steps of totalWidth.
     */
    height?: number | `=${string}` | `@${string}` | Expression;
    /**
     * The width of the image of the export without one given, the one of the container otherwise.
     */
    width?: number;
    margins?: Margins;
    /**
     * The coordinate system of the marks, cartesian (a horizontal and a vertical axis) by default, polar (an angle and a radius) or geo (a map).
     */
    coord?: `=${string}` | ('cartesian' | 'polar' | 'geo') | (string & {});
    locale?: Locale;
    /**
     * The language of the texts in several languages (e.g. { "de": "Bevölkerung", "en": "Population" }), a tag, e.g. en, or a global, e.g. @lang of a control or of the page; the locale of the numbers and dates without `locale`; by default the language of `locale`.
     */
    language?: string;
    /**
     * The elements move to their new values in this many milliseconds (true for 300) after a change of a legend, a control or the state.
     */
    transition?: number | boolean;
    /**
     * The class of the element of the visualisation (vis), a template of the globals, e.g. for the styles of a page.
     */
    class?: string;
    /**
     * A text instead of the marks and the legends, a template and an expression of the globals and totalWidth, e.g. steps of a narrow screen, null or an empty text for the marks.
     */
    message?: string | null | `=${string}` | `@${string}` | Expression;
    /**
     * A text instead of the marks if there are no rows, e.g. of a filter, a template of the globals.
     */
    empty?: string | InLanguages | Expression;
    hover?: Hover;
    highlight?: Highlight;
    /**
     * Css font-family, by default the css variable --gen-vis-font-family or Inter (in the package).
     */
    fontFamily?: string;
    /**
     * The dims of the columns of the data by their names, the marks and all other parts of the definition refer to them, a text is the column, null removes a dim, e.g. of a parent.
     */
    dims?: {
        [k: string]: Dim | string | None;
    };
    /**
     * A mark or a list of marks, the layers of the chart, drawn in order; also an expression of a global, e.g. "=match(@kind, {map: literal([...])}, literal([...]))".
     */
    marks?: Mark[] | `=${string}` | `@${string}` | Expression | Mark;
    /**
     * An annotation or a list of them, bands, lines, texts and circles at values of the dims, e.g. { "type": "band", "x": ["2025-07-01", null], "label": "Schätzung" }; also an expression of a global.
     */
    annotations?: Annotation[] | `=${string}` | `@${string}` | Expression | Annotation;
    facets?: Facets;
    /**
     * The geometry of a map (coord geo), the rows are joined to its features, null removes the one of a parent.
     */
    geo?: Geo | None;
}
/**
 * A column computed of the data, e.g. an index of a base year.
 */
export interface Transform {
    /**
     * year: the year of a date, align: the date in the year `year`, index: relative to the mean of the base, mean: the mean of the base (all rows by default) of the group, share: of the sum of the group, rolling: the mean of `size` rows, cumulative: the sum up to the row, calc: the value of the expression `expr` of the row, filter: only the rows whose expression `expr` is true, rank: the rank in the group, random: a random number of the row in `range`, the same of every draw (`seed`), lookup: the `value` of the row of a file of `data` of the `key`, bin: a row per class of `edges` and group of `by` with its `start`, `end` and the number of the values of `column` in it (`as`), after the rows or instead of them (`replace`), fold: wide to long, a row per row and column of `columns` with its name (`key`) and its value (`value`), aggregate: the `op` (sum, mean, median, q1, ...) of the values of the group, a column or a row per group (`rows`), window: the value `offset` rows before or after the row (`op` lag, lead, diff, pct) or the `op` (sum, mean, min, max, median, ...) of a window of `size` rows, regression: the value of the least squares fit of `column` on `x` in the group (`method`), e.g. a trend line.
     */
    type:
        | 'year'
        | 'align'
        | 'index'
        | 'mean'
        | 'share'
        | 'rolling'
        | 'cumulative'
        | 'calc'
        | 'filter'
        | 'rank'
        | 'random'
        | 'lookup'
        | 'bin'
        | 'fold'
        | 'aggregate'
        | 'window'
        | 'regression';
    /**
     * The column of the values, a template of the globals, of a lookup the one of the keys.
     */
    column?: string;
    /**
     * calc: the expression of the value of the row, filter: the expression of the rows which are kept, its names are the columns of the row and the globals, e.g. "@value / @inno * 100" or "@value > 0".
     */
    expr?: string | number | boolean | null | Expression;
    /**
     * mean: the least number of values, without as many values the mean is missing, 1 by default.
     */
    min?: number;
    /**
     * rank: the largest value is the first one.
     */
    descending?: boolean;
    /**
     * lookup: the url of a file of rows, relative to the definition, not a template.
     */
    data?: string;
    /**
     * lookup: the format of the file, by default the one of the extension of its url.
     */
    dataFormat?: 'csv' | 'tsv' | 'json' | 'parquet';
    /**
     * fold: the column of the names of the folded columns, key by default; lookup: the column of the keys of the rows of the file; random: the column of the keys of the rows, e.g. an id, a row keeps its number also if the rows of the file are in another order (by default its index in the data).
     */
    key?: string;
    /**
     * fold: the column of the values of the folded columns, value by default; lookup: the column of the values of the rows of the file, a template of the globals, e.g. "name_{lang}".
     */
    value?: string;
    /**
     * The name of the new column, by default the one of `column`, which it replaces; bin: the column of the number of the values of the class, count by default; aggregate with `rows`: the column of the aggregate of the group.
     */
    as?: string;
    /**
     * bin: the edges of the classes, numbers and ranges { "from": 50, "to": 250, "step": 5 }, sorted together, e.g. [{ "from": 50, "to": 250, "step": 5 }, 143]. A class includes its start, the last one also its end, values outside the edges are left out.
     */
    edges?: (
        | number
        | string
        | {
              from: number;
              to: number;
              step: number;
          }
    )[];
    /**
     * bin: the width of the classes without edges, also a template of the globals, e.g. "{step}", from the largest multiple of it not above the least value to the smallest one not below the largest value.
     */
    step?: number | string;
    /**
     * bin: the column of the weights of the rows, the value of a class is the sum of the weights of its values, e.g. of a reporting lag.
     */
    weight?: string;
    /**
     * bin: the value of a class, the count (or the sum of the weights), the share of the sum of the group or the density (the share per unit of column, per `per` units), e.g. densities of categories of different sizes.
     */
    normalize?: 'count' | 'share' | 'density';
    /**
     * bin: the value per this many units of the width of a class, e.g. 5 of the count per 5k of classes of unequal widths, of a density the share per 5 units.
     */
    per?: number;
    /**
     * bin: the column of the start of the class, start by default.
     */
    start?: string;
    /**
     * bin: the column of the end of the class, end by default.
     */
    end?: string;
    /**
     * bin, fold: the rows of the transform replace the rows (by default of a fold); without it they come after them (by default of a bin), e.g. a histogram and a strip plot of the same values, the marks draw the rows with the values they use.
     */
    replace?: boolean;
    /**
     * random: the least and the largest number, [0, 1] by default.
     *
     * @minItems 2
     * @maxItems 2
     */
    range?: [number, number];
    /**
     * random: another seed gives other numbers, 0 by default.
     */
    seed?: number | string;
    /**
     * The groups of the rows of the same values of these columns, e.g. a line per category.
     */
    by?: string | string[];
    /**
     * The column of the order of the rows of rolling, cumulative, window and of the first and last values of aggregate, e.g. the date, the order of the rows by default.
     */
    order?: string;
    /**
     * The rows of the base of an index or of a mean: a column and its value, e.g. { "year": "{base}" }, or a range [from, to], e.g. of dates or years, { "year": [1961, 1990] }.
     */
    base?: {
        [k: string]: unknown;
    };
    /**
     * The value of the base of an index (100 by default).
     */
    scale?: number;
    /**
     * The number of the rows of the window of rolling and of the sums, means, least and largest values of window.
     */
    size?: number;
    /**
     * The window of rolling and window: the rows before the row (end, by default) or around it.
     */
    align?: 'end' | 'center';
    /**
     * fold: the columns to fold, a list of names or a pattern with a single `*`, e.g. "20*", the columns of all rows which match, in their order, templates of the globals.
     */
    columns?: string | string[];
    /**
     * aggregate: the aggregate of the values of the group, sum, mean, min, max, count (the number of values), median, q1 and q3 (the lower and the upper quartile), quantile (of `p`), first or last (in the order of `order`), missing values are left out; window: lag or lead (the value `offset` rows before or after the row, a number or the value as it is, e.g. a text), diff (the value minus the one before) or pct (the change in percent), or sum, mean, min, max, median, q1, q3, quantile of the window of `size` rows.
     */
    op?:
        | 'sum'
        | 'mean'
        | 'min'
        | 'max'
        | 'count'
        | 'median'
        | 'q1'
        | 'q3'
        | 'quantile'
        | 'first'
        | 'last'
        | 'lag'
        | 'lead'
        | 'diff'
        | 'pct';
    /**
     * aggregate and window of the op quantile: the probability, from 0 to 1, e.g. 0.9 of the 90th percentile; interpolated between the two nearest values (R-7, as median, q1 and q3).
     */
    p?: number;
    /**
     * aggregate: a row per group instead of a column, with the columns `by` and `as`, the rows replace the rows.
     */
    rows?: boolean;
    /**
     * window: the number of rows before (lag, diff, pct) or after (lead) the row, 1 by default.
     */
    offset?: number;
    /**
     * The year of align, 2020 by default.
     */
    year?: number;
    /**
     * regression: the column of the x values, numbers or dates.
     */
    x?: string;
    /**
     * regression: the curve fitted, linear (y = a + bx), log (y = a + b ln x, of x > 0), exp (y = a e^(bx), of y > 0) or poly (a polynomial of `degree`).
     */
    method?: 'linear' | 'log' | 'exp' | 'poly';
    /**
     * regression: the degree of the polynomial of the method poly, 2 by default.
     */
    degree?: number;
}
/**
 * An operator, an object of one key, the operator, and its arguments, e.g. { "*": ["@innerWidth", 0.5] } or { "steps": ["@totalWidth", { "0": 220, "550": 250 }] }; the string syntax writes it as "=@innerWidth * 0.5", see spec/expressions.md of the package.
 */
export interface Expression {
    /**
     * The sum of the values.
     */
    '+'?: PropEntry[] | PropEntry;
    /**
     * The first value minus the others, of one value its negation.
     */
    '-'?: PropEntry[] | PropEntry;
    /**
     * The product of the values.
     */
    '*'?: PropEntry[] | PropEntry;
    /**
     * The first value divided by the others, no value of a division by 0.
     */
    '/'?: PropEntry[] | PropEntry;
    /**
     * The least value.
     */
    min?: PropEntry[] | PropEntry;
    /**
     * The largest value.
     */
    max?: PropEntry[] | PropEntry;
    /**
     * [value, digits]: the value rounded to digits (0 by default), halves up.
     */
    round?: PropEntry[] | PropEntry;
    /**
     * The same values, as texts, e.g. 2024 and "2024", more values are a chain of every pair of neighbours.
     */
    '=='?: PropEntry[] | PropEntry;
    /**
     * Not the same values, more values are a chain of every pair of neighbours.
     */
    '!='?: PropEntry[] | PropEntry;
    /**
     * Numbers by their value, otherwise texts, false of a missing value, more values are a chain, e.g. [0, "@x", 10].
     */
    '<'?: PropEntry[] | PropEntry;
    /**
     * See <.
     */
    '<='?: PropEntry[] | PropEntry;
    /**
     * See <.
     */
    '>'?: PropEntry[] | PropEntry;
    /**
     * See <.
     */
    '>='?: PropEntry[] | PropEntry;
    /**
     * True of a false value (false, 0, "", null, an empty list).
     */
    not?: PropEntry[] | PropEntry;
    /**
     * The values as texts, joined.
     */
    cat?: PropEntry[] | PropEntry;
    /**
     * [condition, value, condition, value, ..., otherwise]: the value of the first true condition.
     */
    if?: PropEntry[] | PropEntry;
    /**
     * The first false value, otherwise the last one.
     */
    and?: PropEntry[] | PropEntry;
    /**
     * The first true value, otherwise the last one, e.g. a default ["@color", "black"].
     */
    or?: PropEntry[] | PropEntry;
    /**
     * [value, { "cut": value, ... }]: the value of the largest cut below the value, e.g. ["@totalWidth", { "0": 220, "550": 250 }].
     */
    steps?: PropEntry[] | PropEntry;
    /**
     * [value, { "case": value, ... }, default]: the value of the case of the value (as a text), otherwise the default.
     */
    match?: PropEntry[] | PropEntry;
    /**
     * [value, format]: the value as a text of a d3 format in the locale, e.g. ["@y", ",.1f"] or of dates ["@x", "%b %Y"].
     */
    format?: PropEntry[] | PropEntry;
    /**
     * A value which is not evaluated, e.g. a text starting with @.
     */
    literal?: {
        [k: string]: unknown;
    };
    /**
     * A reference, a name or [name, default], the default of an unknown name.
     */
    var?: string | [unknown] | [unknown, unknown];
}
/**
 * The rows of the values of dims, e.g. { "year": "@globals.year", "land": ["Wien", "Tirol"] }: a value, a reference to a global or a list of values (also null, { "not": ... } or { "range": [from, to] }), every condition holds.
 */
export interface Conditions {
    [k: string]: unknown;
}
/**
 * A control of a global, e.g. { "type": "radio", "global": "scale", "values": ["linear", "log"] }: its value is the one of the global, the parts of the definition are expressions of it.
 */
export interface Control {
    /**
     * Radio buttons, a drop down list, a slider over the entries or hidden, the global is set by the page (the prop globals).
     */
    type?: 'radio' | 'select' | 'slider' | 'hidden';
    /**
     * The global the control sets, the parts of the definition refer to it in expressions, e.g. "=match(@scale, {log: 'log'}, 'linear')".
     */
    global?: string;
    /**
     * The label of the control.
     */
    name?: string | InLanguages;
    /**
     * The id of the control, the global by default; the controls of a parent and its children are merged by it (by the global if one of them has no id), so a child may give only the id and the ids (or values) of the entries it changes.
     */
    id?: string;
    /**
     * The selection is named below the subtitle of the PNG, false for ones which only change the presentation, e.g. shared scales.
     */
    inImage?: boolean;
    values?:
        | (ControlValue | string | number)[]
        | {
              column: string;
              /**
               * The format of the names of the values in the locale: of dates a time format, e.g. "%b %Y" (Okt 2026), "%K. Halbjahr %Y", a number format otherwise.
               */
              format?: string;
              /**
               * The column of the names of the values, of the first row of a value, e.g. monthName.
               */
              names?: string;
          };
}
/**
 * The text in several languages by their tags, e.g. { "de": "Bevölkerung", "en": "Population" }: the one of `language`, else the one of its language without the region (de of de-AT), else the first one.
 */
export interface InLanguages {
    [k: string]: string;
}
/**
 * An entry, other fields of scalars are names of the templates while it is selected, e.g. {group:short} of a field short of the entry of the global group.
 */
export interface ControlValue {
    /**
     * The value of the global while the entry is selected.
     */
    value?: string | number | boolean | null | unknown[];
    /**
     * The value by default.
     */
    name?: string | InLanguages;
    /**
     * The value by default, of the merge with the entries of a parent.
     */
    id?: string;
    /**
     * Globals which are set when the entry is selected, e.g. a name used by the texts.
     */
    globals?: {
        [k: string]: unknown;
    };
    [k: string]:
        | string
        | number
        | boolean
        | null
        | unknown[]
        | InLanguages
        | {
              [k: string]: unknown;
          }
        | undefined;
}
/**
 * The hover: the dims of its rows (columns) and its box, templates of html, their values are text.
 */
export interface Hover {
    /**
     * The dims of the hover beside the value of the position (its rows of their values, in this order), by default the dims the marks use, of their `by` and their positions x and y (not the ends of ranges, not the ones of the facets); a dim with a `hover` of its own is in it as well, [] only those.
     */
    columns?: string[];
    /**
     * The value of the position (e.g. y of a line, x of horizontal bars) as a cell of the rows, true by default; false shows only the categories and the dims of the columns, e.g. the unsigned values of a population pyramid.
     */
    value?: boolean;
    /**
     * A row of the sum of the stacked values of the position below the rows (true, or its name, e.g. Gesamt), in the format of the values; also {total} of the title.
     */
    total?: boolean | string | InLanguages;
    /**
     * The rows of the nearest position of the axis (position, by default) or the row of the nearest point, e.g. of a scatter plot.
     */
    mode?: `=${string}` | ('position' | 'point');
    /**
     * The distance of the nearest point in pixels, 30 by default.
     */
    radius?: number;
    /**
     * The rows with a hover, e.g. not the ones of headers, an expression of the row or the values of dims.
     */
    filter?: `=${string}` | `@${string}` | Expression | Conditions;
    /**
     * false: no box of the hover, its highlight and the events stay, e.g. a hover of the highlight only.
     */
    box?: boolean;
    /**
     * false: no line of the position of the hover.
     */
    marker?: boolean;
    /**
     * true: a crosshair, a horizontal and a vertical line across the plot area through the point of the nearest row (of a stacked value the end of its stack), instead of the line of the position, e.g. to read the value at the axis; of cartesian charts, also of the hover of points.
     */
    cross?: boolean;
    /**
     * true: a hover also without rows, e.g. the name of a region without a value.
     */
    empty?: boolean;
    /**
     * The hover is beside the marker of the position (or the center of a region) or at the pointer.
     */
    position?: `=${string}` | ('marker' | 'pointer');
    /**
     * The side of the hover, by default the one with more space, center on the position, e.g. in the center of a polar plot.
     */
    side?: `=${string}` | ('left' | 'right' | 'above' | 'below' | 'center');
    offset?: Pair;
    /**
     * The area of the hover, the plot area or the facet with its margins, e.g. the labels of the rows of horizontal bars.
     */
    area?: `=${string}` | ('plot' | 'facet');
    /**
     * The title, {title} is the default one, e.g. the date, and the globals.
     */
    title?: string | InLanguages;
    /**
     * A row instead of the table: {land} the name of a category, {land.unit} another hover prop, {y} the formatted value, {y.value} the value, and the globals.
     */
    row?: string | InLanguages;
}
/**
 * The highlight of the elements, see highlight and others of the marks.
 */
export interface Highlight {
    /**
     * The attributes move to the ones of the highlight in this many milliseconds, e.g. 50.
     */
    transition?: number;
}
/**
 * A dim of a column of the data, the marks and all other parts of the definition refer to its name; x and y (polar also angle and radius) have a scale of their orientation and an axis, false removes them. The shorthands zero, grid, pad, include, reverse, range, ticks and tickSpacing are parts of the scale and the axis.
 */
export interface Dim {
    /**
     * The column of the data, can be a template of globals, e.g. "{values}{share}", see controls.
     */
    column?: string;
    /**
     * The title of the legend (the title of the axis is axis.title).
     */
    name?: string | InLanguages;
    /**
     * Without a type it follows from the other parts (categories or a band, point or ordinal scale are categorical, a time or utc scale date, other scales numeric, a dim of the facets categorical, not one only used as `by` of a mark) or from the values of the column: numbers numeric, dates date, otherwise categorical (a column without values, e.g. of empty data, date of a time format of the dim, its axis or its hover, otherwise categorical). Missing and invalid numeric and date values are null, dates are timestamps or strings, a date without a time zone, e.g. 2024-06-01 or 01.06.2024 13:00, is the one of the time zone of the scale, local or UTC (utc). Categorical values are strings of every format of the data, e.g. "2004" of the number 2004 of JSON or parquet.
     */
    type?: `=${string}` | ('numeric' | 'date' | 'categorical');
    /**
     * The d3 format of the values (a time format of dates), the one of the axis and of the hover without their own, e.g. ",.0f".
     */
    format?: string | InLanguages;
    /**
     * Of a date dim of a time or utc scale: a value is the period starting at it, day, week, month, quarter, half (a year), year or a number of them, e.g. "6 months": the domain of the data reaches the end of the last period; @x:scaled (also @x:scaled:center) is the middle of the period of a row, so bars, points, lines and the hover are in the middle of their period, @x:scaled:start and @x:scaled:end are its start and end, @x:step its length in pixels (bars 80% of it by default); ticks, grid lines and annotations stay at their dates; the hover shows the period, e.g. H2 2023 (%K is the half of the year in formats).
     */
    interval?: string;
    scale?: Scale | Removed;
    axis?: Axis | Removed;
    legend?: Legend | Removed;
    hover?: DimHover | Removed;
    /**
     * The domain of the scale, see scale.domain, e.g. [0, null].
     */
    domain?: [DomainValue, ...DomainValue[]] | `=${string}` | `@${string}` | Expression;
    /**
     * The domain starts at 0, e.g. of bars (a domain [0, null]).
     */
    zero?: boolean;
    /**
     * Rounds the ends of the domain of the scale, see scale.nice.
     */
    nice?: boolean | number;
    /**
     * Extends the ends of the domain taken from the data relative to its size, see scale.pad, e.g. 0.1.
     */
    pad?: (number | [number, number]) | `=${string}` | `@${string}` | Expression;
    /**
     * Values the domain includes, see scale.include, e.g. 0.
     */
    include?: (DomainValue | DomainValue[]) | `=${string}` | `@${string}` | Expression;
    /**
     * The range in the other direction, see scale.reverse.
     */
    reverse?: boolean;
    /**
     * The range of the scale, see scale.range, e.g. [0, "@height"] of a vertical band from the top.
     */
    range?: (number | string | Expression)[] | `=${string}` | `@${string}` | Expression;
    /**
     * Lines at the ticks of the axis, see axis.grid.
     */
    grid?: boolean;
    /**
     * The number of the ticks of the axis, see axis.ticks.
     */
    ticks?: NumberValue | None;
    /**
     * A number, a reference "@name", e.g. to a global, or an expression, e.g. of totalWidth.
     */
    tickSpacing?: number | `=${string}` | `@${string}` | Expression;
    /**
     * The categories by their key (the value of the column) and their props, e.g. colors, in the order of the legend, the facets and the stacks, a text is the color; listed categories are all of them (`fromData` adds the others), without listed ones the ones of the data.
     */
    categories?: {
        [k: string]: CategoryProps | string;
    };
    /**
     * The colors of the categories in their order as the prop color, a d3 scheme, e.g. Tableau10.
     */
    scheme?: string;
    common?: CategoryProps1;
    /**
     * The values of the column which are not in categories are categories as well, after them, in ascending order (true) or in the order of the rows ("rows", the default of a dim without listed categories).
     */
    fromData?: boolean | 'rows';
    /**
     * The order of the categories: the one of categories (keys which are integers ascending first), ascending, descending (numbers by their value), rows (all in the order of the rows of the data, also the listed ones) or a list of keys which are first.
     */
    order?: (`=${string}` | ('ascending' | 'descending' | 'rows')) | Key[];
    /**
     * The props of the categories by their rank in the order: of the first one, the second one, ..., the last entry is the one of all others, e.g. the newest year red.
     */
    ranks?: CategoryProps[];
    /**
     * Of a dim of values which no mark stacks (`stack` of a mark stacks its values): the values are stacked, true all rows or the condition of the rows which are stacked, the others have their own value as start and end.
     */
    stacked?: boolean | `=${string}` | `@${string}` | Expression | Conditions;
    /**
     * Of a stacked dim: the dim of the positions of the stacks, by default the one of the positions of the coordinate system (x of vertical bars), e.g. the start of the class of a bin (lo) of a histogram whose x are the values of the rows; rows without a value of it are not stacked.
     */
    stackBy?: string;
}
/**
 * The scale of a dim, by default of its type and its position (x and y, polar angle and radius, have a scale of the orientation of their name).
 */
export interface Scale {
    /**
     * The scale of another dim, e.g. "y", the values of this one are positions on it too, e.g. the other end of a band, and they are in its domain, without the other parts of a scale.
     */
    of?: string;
    /**
     * By default linear for a numeric dim, time for a date one, band (bars) or point for a categorical position and ordinal for other categorical ones. A d3 scale, continuous scales and the ones of classes (quantize, quantile, threshold) need a numeric or date dim, point and band a categorical one, ordinal ones are of any values, e.g. colors of categories, positions of dates need a time or utc scale.
     */
    type?:
        | `=${string}`
        | (
              | 'band'
              | 'diverging'
              | 'divergingLog'
              | 'divergingPow'
              | 'divergingSqrt'
              | 'divergingSymlog'
              | 'identity'
              | 'linear'
              | 'log'
              | 'ordinal'
              | 'point'
              | 'pow'
              | 'quantile'
              | 'quantize'
              | 'radial'
              | 'sequential'
              | 'sequentialLog'
              | 'sequentialPow'
              | 'sequentialQuantile'
              | 'sequentialSqrt'
              | 'sequentialSymlog'
              | 'sqrt'
              | 'symlog'
              | 'threshold'
              | 'time'
              | 'utc'
          );
    /**
     * null: no position, e.g. a y dim of the sizes of points. Places the scale on the plot, horizontal and vertical in the cartesian coordinate system, angular and radial in the polar one.
     */
    orientation?: `=${string}` | `@${string}` | Expression | ('horizontal' | 'vertical' | 'angular' | 'radial' | null);
    /**
     * Fixes the domain, a null first or last entry is taken from the data, the values are converted as the ones of the data, e.g. dates, and can be references, e.g. to a global. A diverging scale has a middle entry, a threshold scale the values between its classes, a point or band scale its categories in their order; also `domain` of the dim.
     */
    domain?: [DomainValue, ...DomainValue[]] | `=${string}` | `@${string}` | Expression;
    /**
     * Values the domain taken from the data includes, e.g. 0 or 100, a value or a list, also references; also `include` of the dim.
     */
    include?: (DomainValue | DomainValue[]) | `=${string}` | `@${string}` | Expression;
    /**
     * A value of a dim, e.g. a date of a string, a reference "@name", e.g. to a global, or an expression, null is taken from the data.
     */
    center?: number | string | null | Expression;
    /**
     * The end of the classes of a threshold scale they include, the lower one (left, value >= limit) or the upper one (right, value > limit).
     */
    closed?: `=${string}` | ('left' | 'right');
    domainAbs?: Pair1;
    /**
     * Extends the ends of the domain taken from the data (not fixed ones, e.g. 0 of bars) relative to its size, both (a number) or at the start and the end ([start, end]), positive values extend, e.g. 0.1 of 10% below and above; also `pad` of the dim.
     */
    pad?: (number | [number, number]) | `=${string}` | `@${string}` | Expression;
    /**
     * The conditions of the filter of the definition (their dims, true all) the domain taken from the data ignores, e.g. ["month"] of a slider over months: the scale is the same for all months, the marks draw the rows of the month.
     */
    domainIgnores?: boolean | string[];
    /**
     * Numeric dims only: rounds the ends of the domain taken from the data, e.g. 0.951 to 1, true for steps of about a tenth of the domain or the number of steps; also `nice` of the dim.
     */
    nice?: boolean | number;
    /**
     * The range in the other direction, e.g. the largest value at the bottom; also `reverse` of the dim.
     */
    reverse?: boolean;
    /**
     * By default the width or height of the plot, e.g. colors, references to the sizes of the coordinate system, e.g. "@radius"; also `range` of the dim.
     */
    range?: (number | string | Expression)[] | `=${string}` | `@${string}` | Expression;
    /**
     * Band and point scales: the space between the categories and at the ends in steps, 0.4 by default; of a point scale of angles the place of the first category in steps, half a step after the top (0.5) by default, 0 at the top, e.g. of a radar chart.
     */
    padding?: number;
    /**
     * A number, a reference "@name", e.g. to a global, or an expression, e.g. of totalWidth.
     */
    step?: number | `=${string}` | `@${string}` | Expression;
    /**
     * The order of the categories of the data of a band, point or ordinal scale: of the rows (default), ascending, descending or by the value of a dim of their first row, e.g. bars by their length.
     */
    order?:
        | (`=${string}` | ('ascending' | 'descending'))
        | {
              by: string;
              descending?: boolean;
          };
    /**
     * The categories of a band or point scale in groups of the values of a dim of their rows, with a space between the groups.
     */
    groups?: {
        /**
         * The dim of the groups, e.g. a column of the group of a row.
         */
        by: string;
        /**
         * The space between the groups in steps of the categories, 1 by default.
         */
        padding?: number;
    };
    /**
     * The space at the start and the end of the range in pixels (of positions), a number for both or [start, end], e.g. so the first and the last point are not at the edges of the plot area.
     */
    inset?: (NumberValue | [NumberValue, NumberValue]) | `=${string}` | `@${string}` | Expression;
    /**
     * The colors of a sequential or diverging scale, a d3 interpolator, e.g. Blues, Viridis or RdYlGn.
     */
    interpolator?: string;
    /**
     * The colors of the range, a d3 scheme, e.g. Blues or Tableau10.
     */
    scheme?: string;
    /**
     * The number of colors of a scheme of several sizes, by default the number of classes of a threshold scale or 5.
     */
    classes?: number;
}
/**
 * The axis of a dim of a position, x and y have one by default.
 */
export interface Axis {
    /**
     * top, bottom, left or right of the cartesian coordinate system, angular (around the circle) or radial (from the center) of the polar one.
     */
    position?: `=${string}` | ('top' | 'bottom' | 'left' | 'right' | 'angular' | 'radial');
    /**
     * A value of a dim, e.g. a date of a string, a reference "@name", e.g. to a global, or an expression, null is taken from the data.
     */
    at?: number | string | null | Expression;
    /**
     * The angle of a radial axis in degrees, clockwise from the top, 0 by default.
     */
    angle?: number;
    /**
     * The grid lines of a radial axis, circles or polygons through the ticks of the angle, e.g. of radar charts.
     */
    gridShape?: `=${string}` | ('circle' | 'polygon');
    /**
     * The number of the ticks, null for the ones of tickSpacing, e.g. of a parent; also `ticks` of the dim.
     */
    ticks?: NumberValue | None;
    /**
     * A number, a reference "@name", e.g. to a global, or an expression, e.g. of totalWidth.
     */
    tickSpacing?: number | `=${string}` | `@${string}` | Expression;
    /**
     * Fixed ticks, converted as the values of the data, categories as strings, e.g. [2004, 2008] or ["2004", "2008"] of the years of any format of the data, the ones outside of the domain or which are no category of a band or point scale are left out, also an expression, e.g. steps of totalWidth; all of them are labelled (other labels of a horizontal axis which overlap show every n-th one).
     */
    values?: unknown[] | `=${string}` | `@${string}` | Expression;
    /**
     * A d3 number or time format.
     */
    format?: string | InLanguages;
    /**
     * The props of the labels of the ticks (svg attributes and text), of the props of the categories of the tick and of the categories of its row of the dims `by`, its values and the names of the facet, e.g. { "by": ["level"], "props": { "font-weight": "@weight", "text": "@short", "max-width": 300 } }, of all axes, e.g. { "props": { "fill": "#777", "font-size": 10, "stroke-width": 2 } } of the values of a radial axis in the background, the stroke and its width replace the halo of the labels of radial axes.
     */
    labels?: {
        /**
         * The dims of categories whose props the labels have, of the categories of the row of the tick, a dim or a list of them, as `by` of a mark.
         */
        by?: string | string[];
        props?: Props;
        /**
         * Of an axis at a value (`at`): the labels at the edge of the plot area (edge, by default), only the line and the tick marks at the value, or with them (axis), without the label where the other axis crosses.
         */
        at?: `=${string}` | ('edge' | 'axis');
        /**
         * Angular axes: the labels along the circle, centered at the tick (true) or between it and the next one (between), e.g. the names of the months, the ones of the lower half are not upside down.
         */
        curved?: boolean | 'between';
    };
    /**
     * The tick marks: false leaves them out (the labels stay at their places), their length (size, 9 pixels across the line of cartesian axes, 6 outside of the circle of angular ones by default, the labels move with it), the part of it inside the plot area (inset, by default 4 pixels of bottom and right axes, 5 of top and left ones, 0 of angular ones, e.g. 0 for marks outside only) and their props (svg attributes of the names of the facet), e.g. { "props": { "stroke": "var(--gen-vis-grid-color)" } }, radial axes have none.
     */
    tickMarks?:
        | false
        | {
              size?: number;
              inset?: number;
              props?: Props;
          };
    /**
     * The props of the line of the axis (svg attributes, its class is domain, a circle of an angular axis) of the names of the facet, e.g. { "props": { "stroke-opacity": 0.4 } }.
     */
    domain?: {
        props?: Props;
    };
    /**
     * The angle of the labels in degrees, positive counterclockwise, negative clockwise.
     */
    rotate?: number;
    /**
     * Lines at the ticks; also `grid` of the dim.
     */
    grid?: boolean;
    title?: {
        name?: string | InLanguages;
        /**
         * The distance from the axis in pixels, by default of cartesian axes 8 pixels inside the edge of the margin, of radial axes 16 pixels outside of the circle (see the prop defaults).
         */
        offset?: number;
        /**
         * Of a vertical axis: beside it, rotated, in the middle of the range of its scale (side), or horizontal above its range (top), e.g. the unit at the top left, starting at the distance offset from the axis.
         */
        position?: `=${string}` | ('side' | 'top');
        /**
         * Of a title at the top: its distance above the range of the scale, 8 pixels by default.
         */
        gap?: number;
    };
    /**
     * The gap between the tick marks and the labels in pixels, also of polar axes, 3 by default (see the prop defaults).
     */
    padding?: number;
}
/**
 * Svg attributes (and text), values, references "@name", expressions or nested props, e.g. d of a path.
 */
export interface Props {
    [k: string]: PropEntry;
}
/**
 * Toggles of the categories of the dim (a legend of the colors of its scale of a dim with a scale), {} is one of the defaults.
 */
export interface Legend {
    /**
     * The place of the legend, above or below the plots or beside them, the plots have the rest of the width, an expression of totalWidth (the width of the visualisation), e.g. below the plots of a phone.
     */
    position?: `=${string}` | `@${string}` | Expression | ('top' | 'bottom' | 'left' | 'right');
    /**
     * The direction of the scale of the colors, a vertical one has the high values at the top, an expression of totalWidth (the width of the visualisation).
     */
    orientation?: `=${string}` | `@${string}` | Expression | ('horizontal' | 'vertical');
    /**
     * Of a legend of the colors of a threshold, quantize or quantile scale: a label per class in its middle, e.g. < 50, 50–100, ≥ 300, instead of ticks at the limits.
     */
    classes?: boolean;
    /**
     * Only the entries of the categories of the rows after the filter, e.g. of the selected year, also the hidden ones.
     */
    onlyData?: boolean;
    /**
     * The length of the scale of the colors in pixels.
     */
    size?: number;
    /**
     * The ticks of a gradient of colors, e.g. [0, 50, 100].
     */
    values?: number[];
    /**
     * The labels of the scale of colors after it (below, right of a vertical one) or before it.
     */
    labels?: `=${string}` | ('before' | 'after');
    /**
     * The format of the values of the colors of a scale, by default the one of the hover.
     */
    format?: string | InLanguages;
    /**
     * An entry of the regions without a value beside the colors of a scale, e.g. { "name": "no data", "color": "#EEE" }.
     */
    missing?: {
        name: string | InLanguages;
        /**
         * By default #EEE.
         */
        color?: string;
    };
    symbol?: LegendSymbol;
    /**
     * HTML attributes of the entries, e.g. a title, props of the categories.
     */
    props?: {
        [k: string]: Value;
    };
}
export interface SymbolElements {
    size?: number;
    width?: number;
    height?: number;
    elements?: {
        /**
         * An svg element, e.g. line or circle.
         */
        type: string;
        props?: Props;
    }[];
}
/**
 * The dim in the hover (also {} for its defaults), the format of its value; null or false removes it, e.g. of a parent.
 */
export interface DimHover {
    /**
     * false: the value is a name of the templates of the hover (e.g. {half} of the title), without a cell of the table.
     */
    cell?: boolean;
    /**
     * By default the format of the axis.
     */
    format?: string | InLanguages;
    /**
     * The columns of the entries of a categorical dim, name by default.
     */
    props?: {
        [k: string]: Value;
    };
    /**
     * The rows of the hover of the categories of a categorical dim.
     */
    row?: {
        /**
         * CSS properties of the row of a category, props of the props of the categories, e.g. { "font-style": "@hoverStyle" }, the nearest row stays bold.
         */
        props?: {
            [k: string]: Value;
        };
    };
}
/**
 * The props of a category (name, color, visible, legend, symbol and any attribute of the marks of the category, e.g. "stroke-width"), a text is its color.
 */
export interface CategoryProps {
    /**
     * The key by default.
     */
    name?: string | InLanguages;
    /**
     * The color of the category, the fill and stroke of its marks by default.
     */
    color?: string;
    visible?: boolean;
    /**
     * false: the category has no entry in the legend, it stays visible, e.g. headers.
     */
    legend?: boolean;
    /**
     * The symbol before the name of a category: auto (the default) of the marks of the categories (a box of their bars or areas, a line of their lines, a dot of their points), line, rect or circle in its color, or the svg elements, drawn in a box of width x height pixels (size both, by default the one of the defaults of the chart, 16) from 0, 0, at the middle of the capitals of the name; null (or an object without elements) is none, e.g. instead of the one of a parent.
     */
    symbol?:
        | null
        | (`=${string}` | ('line' | 'rect' | 'circle' | 'auto'))
        | {
              type: `=${string}` | ('line' | 'rect' | 'circle' | 'auto');
              size?: number;
              /**
               * The width of the box, size by default, e.g. a longer line of a dash.
               */
              width?: number;
              /**
               * The height of the box, size by default.
               */
              height?: number;
              props?: Props;
              elements?: Elements;
          }
        | SymbolElements;
    [k: string]:
        | Value
        | string
        | InLanguages
        | boolean
        | null
        | `=${string}`
        | 'line'
        | 'rect'
        | 'circle'
        | 'auto'
        | {
              type: `=${string}` | ('line' | 'rect' | 'circle' | 'auto');
              size?: number;
              /**
               * The width of the box, size by default, e.g. a longer line of a dash.
               */
              width?: number;
              /**
               * The height of the box, size by default.
               */
              height?: number;
              props?: Props;
              elements?: Elements;
          }
        | SymbolElements
        | undefined;
}
/**
 * The props of a category (name, color, visible, legend, symbol and any attribute of the marks of the category, e.g. "stroke-width"), a text is its color.
 */
export interface CategoryProps1 {
    /**
     * The key by default.
     */
    name?: string | InLanguages;
    /**
     * The color of the category, the fill and stroke of its marks by default.
     */
    color?: string;
    visible?: boolean;
    /**
     * false: the category has no entry in the legend, it stays visible, e.g. headers.
     */
    legend?: boolean;
    /**
     * The symbol before the name of a category: auto (the default) of the marks of the categories (a box of their bars or areas, a line of their lines, a dot of their points), line, rect or circle in its color, or the svg elements, drawn in a box of width x height pixels (size both, by default the one of the defaults of the chart, 16) from 0, 0, at the middle of the capitals of the name; null (or an object without elements) is none, e.g. instead of the one of a parent.
     */
    symbol?:
        | null
        | (`=${string}` | ('line' | 'rect' | 'circle' | 'auto'))
        | {
              type: `=${string}` | ('line' | 'rect' | 'circle' | 'auto');
              size?: number;
              /**
               * The width of the box, size by default, e.g. a longer line of a dash.
               */
              width?: number;
              /**
               * The height of the box, size by default.
               */
              height?: number;
              props?: Props;
              elements?: Elements;
          }
        | SymbolElements;
    [k: string]:
        | Value
        | string
        | InLanguages
        | boolean
        | null
        | `=${string}`
        | 'line'
        | 'rect'
        | 'circle'
        | 'auto'
        | {
              type: `=${string}` | ('line' | 'rect' | 'circle' | 'auto');
              size?: number;
              /**
               * The width of the box, size by default, e.g. a longer line of a dash.
               */
              width?: number;
              /**
               * The height of the box, size by default.
               */
              height?: number;
              props?: Props;
              elements?: Elements;
          }
        | SymbolElements
        | undefined;
}
/**
 * A mark, a layer of the chart: its type and the dims of its channels (x, y, ...), the attributes of its elements (e.g. "stroke-width": 2, "fill": "@color" of its categories), expressions of the row, the names of the facet and the globals, nested props, e.g. d of a path.
 */
export interface Mark {
    /**
     * The type of the mark, line, area, bar, rule, tick, point, label, text or cell of cartesian charts, arc of polar ones, base, region, mesh of maps, with the default attributes of the type, a definition writes only the ones which differ.
     */
    type?:
        | `=${string}`
        | (
              | 'arc'
              | 'area'
              | 'bar'
              | 'base'
              | 'cell'
              | 'circle'
              | 'label'
              | 'line'
              | 'mesh'
              | 'point'
              | 'rect'
              | 'region'
              | 'rule'
              | 'text'
              | 'tick'
          )
        | (
              | 'svg:circle'
              | 'svg:line'
              | 'svg:rect'
              | 'svg:text'
              | 'cartesian:line'
              | 'cartesian:area'
              | 'cartesian:rule'
              | 'cartesian:bar'
              | 'polar:line'
              | 'polar:area'
              | 'polar:arc'
              | 'polar:circle'
              | 'polar:text'
              | 'geo:base'
              | 'geo:region'
              | 'geo:circle'
              | 'geo:text'
              | 'geo:mesh'
              | 'annotation:band'
              | 'annotation:line'
              | 'annotation:text'
              | 'annotation:circle'
          )
        | (string & {});
    /**
     * The class and the data-mark of the group of the mark, mark-<index> by default, the marks of a parent are merged by their ids.
     */
    id?: string;
    /**
     * The rows are grouped by this dim or these dims, e.g. a line per category, the props of their categories are known to the attributes (@color, @name, ...).
     */
    by?: string | string[];
    /**
     * The dim of the horizontal position (x by default); a number is a value on the scale of x of a rule, a point or a text (cartesian), pixels otherwise (=literal(n) are pixels).
     */
    x?: string | number | Expression;
    /**
     * The dim of the vertical position (y by default); a number is a value on the scale of y of a bar, a rule, a point or a text (cartesian), pixels otherwise (=literal(n) are pixels).
     */
    y?: string | number | Expression;
    /**
     * The start of a bar or an area (a dim, a number on the scale of x), e.g. the start of a class of a bin, 0 by default.
     */
    x0?: string | number | Expression;
    /**
     * The end of a bar of a class of a bin, or of an area; of a rule its start (a number on the scale of x).
     */
    x1?: string | number | Expression;
    /**
     * The other end of a rule (a number on the scale of x).
     */
    x2?: string | number | Expression;
    /**
     * The start of a bar or an area (a dim, a number on the scale of y), 0 by default.
     */
    y0?: string | number | Expression;
    /**
     * The end of a bar or an area, e.g. the upper edge of a band of a range; of a rule its start (its other end is y2, a number on the scale of y).
     */
    y1?: string | number | Expression;
    /**
     * The other end of a rule, e.g. "hi" of an error bar (a number on the scale of y).
     */
    y2?: string | number | Expression;
    /**
     * Of a map: the dim of the longitude of a point or a text, or an expression of the row.
     */
    lon?: string | number | Expression;
    /**
     * Of a map: the dim of the latitude, or an expression of the row.
     */
    lat?: string | number | Expression;
    /**
     * Stacks the values of the mark (bars, areas, arcs) by the groups of `by`, true all rows or the condition of the rows which are stacked, the others have their own value as start and end.
     */
    stack?: boolean | `=${string}` | `@${string}` | Expression | Conditions;
    /**
     * Bars: the groups of `by` (true, the first one) or of this dim beside each other in the band of their position, with `stack` a stack per slot; texts, points and rules (true or a dim): at the middle of the slot of their category, e.g. labels or error bars of dodged bars; texts (a number): the texts are moved apart vertically to at least this distance, e.g. labels at the ends of lines.
     */
    dodge?: boolean | string | number;
    /**
     * tick: its length, the share of the band of its category (or of the slot of a dodged one), 1 by default, e.g. 0.5 of a target narrower than its bar.
     */
    size?: number;
    /**
     * Bars: horizontal bars (the values of x, the categories of y), by default of a categorical y or of a continuous x (e.g. zero) and a y which is not.
     */
    orient?: `=${string}` | ('horizontal' | 'vertical');
    /**
     * Labels: the text beside its position, after it (end, e.g. of horizontal bars), before it (start), above it (top), below it (bottom), on it (center) or at a corner, above and after it (top-end), ....
     */
    anchor?:
        | `=${string}`
        | ('start' | 'end' | 'top' | 'bottom' | 'center' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end');
    /**
     * The rows of the mark, an expression of the row or the values of dims, see filter of the definition.
     */
    filter?: `=${string}` | `@${string}` | Expression | Conditions;
    /**
     * The interpolation of the paths and areas between their points, monotoneX is smooth without overshooting the values, the closed ones connect the last point with the first one, e.g. of radar charts.
     */
    curve?:
        | `=${string}`
        | (
              | 'linear'
              | 'monotoneX'
              | 'natural'
              | 'catmullRom'
              | 'basis'
              | 'step'
              | 'stepBefore'
              | 'stepAfter'
              | 'linearClosed'
              | 'catmullRomClosed'
              | 'basisClosed'
          );
    /**
     * Rows of the mark instead of the ones of the data, e.g. events, with the names of the dims and others, e.g. a label, or the url of a file of them. The values of rows of the definition are expressions, e.g. references to globals.
     */
    data?:
        | string
        | {
              [k: string]: unknown;
          }[];
    /**
     * The format of the url of the data, by default the one of its extension.
     */
    dataFormat?: 'csv' | 'tsv' | 'json' | 'parquet';
    /**
     * One row of every group: the first or the last one, or the one with the least or the most value of a dim, e.g. labels at the ends of lines.
     */
    select?:
        | (`=${string}` | ('first' | 'last'))
        | {
              min?: string;
              max?: string;
          };
    /**
     * below: below the axes and grid lines, above: above the other marks, between them by default.
     */
    layer?: `=${string}` | ('below' | 'above');
    /**
     * The facets of the mark, a key or a list of them, all by default; of a grid also the values of the dims of its rows and columns, e.g. { "group": "Bau" } (a column, a row or a cell).
     */
    facet?: {
        [k: string]: unknown;
    };
    /**
     * One element per facet, of no row: its attributes are the names of the facet, e.g. a header or a unit label at the edge of the plot area, "y": "@plot:top", "text": "@facet:name".
     */
    once?: boolean;
    place?:
        | (`=${string}` | ('pole' | 'centroid'))
        | {
              /**
               * The id of the area mark (cartesian or polar), its bands are the ones of the same categories.
               */
              in: string;
              /**
               * A value of x (of the angle of polar charts) the labels are near of the places of the same room, by default the middle of the positions of their rows.
               */
              near?: {
                  [k: string]: unknown;
              };
              /**
               * The pixels around a text inside its band, besides the halo.
               */
              padding?: number;
          };
    /**
     * geo:text: only the labels which fit into the area around the pole of their feature (estimated of their characters and font size), also of place centroid; texts of place in: true (default) leaves out a label without room in its band, false places it where it violates the least.
     */
    fit?: boolean;
    /**
     * geo:text: false leaves out the labels which overlap the one of a larger area, so a map needs no list of the labels shown; texts of place in: false (default) places the labels apart, true lets them overlap.
     */
    overlap?: boolean;
    /**
     * Of the stairs of a line of x0 and x1: down to the base at both ends (base) or from the first step to the last one (open), e.g. of shares.
     */
    ends?: `=${string}` | ('base' | 'open');
    /**
     * Texts (also of maps): a halo behind the texts in the color of --gen-vis-halo-color, true (3 pixels) or its width, the stroke attributes of the mark replace its stroke.
     */
    halo?: boolean | number;
    /**
     * geo:mesh: the object of the TopoJSON of the borders, the one of the geometry by default, e.g. the states above the districts.
     */
    object?: string;
    /**
     * geo:mesh: all borders, the ones between two features (inner) or the outline (outer).
     */
    borders?: `=${string}` | ('all' | 'inner' | 'outer');
    /**
     * Right before the mark of this id, in its layer, e.g. lines above the bars but below the labels whose halo cuts them.
     */
    before?: string;
    /**
     * The attributes of the elements of the category of the hover or of the entry of the legend, e.g. { "stroke-width": 3 }, mode: the elements of the category (group, default) or only the one of its row (row), e.g. a segment of a stacked bar.
     */
    highlight?: {
        mode?: 'group' | 'row';
        [k: string]: PropEntry | 'group' | 'row' | undefined;
    };
    /**
     * The attributes of the other elements of the mark while an element is highlighted, e.g. { "opacity": 0.3 }.
     */
    others?: {
        [k: string]: PropEntry;
    };
    [k: string]:
        | PropEntry
        | `=${string}`
        | 'arc'
        | 'area'
        | 'bar'
        | 'base'
        | 'cell'
        | 'circle'
        | 'label'
        | 'line'
        | 'mesh'
        | 'point'
        | 'rect'
        | 'region'
        | 'rule'
        | 'text'
        | 'tick'
        | 'svg:circle'
        | 'svg:line'
        | 'svg:rect'
        | 'svg:text'
        | 'cartesian:line'
        | 'cartesian:area'
        | 'cartesian:rule'
        | 'cartesian:bar'
        | 'polar:line'
        | 'polar:area'
        | 'polar:arc'
        | 'polar:circle'
        | 'polar:text'
        | 'geo:base'
        | 'geo:region'
        | 'geo:circle'
        | 'geo:text'
        | 'geo:mesh'
        | 'annotation:band'
        | 'annotation:line'
        | 'annotation:text'
        | 'annotation:circle'
        | (string & {})
        | string
        | string[]
        | number
        | Expression
        | boolean
        | (`=${string}` | `@${string}`)
        | Conditions
        | 'horizontal'
        | 'vertical'
        | 'start'
        | 'end'
        | 'top'
        | 'bottom'
        | 'center'
        | 'top-start'
        | 'top-end'
        | 'bottom-start'
        | 'bottom-end'
        | 'linear'
        | 'monotoneX'
        | 'natural'
        | 'catmullRom'
        | 'basis'
        | 'step'
        | 'stepBefore'
        | 'stepAfter'
        | 'linearClosed'
        | 'catmullRomClosed'
        | 'basisClosed'
        | {
              [k: string]: unknown;
          }[]
        | 'csv'
        | 'tsv'
        | 'json'
        | 'parquet'
        | 'first'
        | 'last'
        | {
              min?: string;
              max?: string;
          }
        | 'below'
        | 'above'
        | {
              [k: string]: unknown;
          }
        | 'pole'
        | 'centroid'
        | {
              /**
               * The id of the area mark (cartesian or polar), its bands are the ones of the same categories.
               */
              in: string;
              /**
               * A value of x (of the angle of polar charts) the labels are near of the places of the same room, by default the middle of the positions of their rows.
               */
              near?: {
                  [k: string]: unknown;
              };
              /**
               * The pixels around a text inside its band, besides the halo.
               */
              padding?: number;
          }
        | 'open'
        | 'all'
        | 'inner'
        | 'outer'
        | {
              mode?: 'group' | 'row';
              [k: string]: PropEntry | 'group' | 'row' | undefined;
          }
        | {
              [k: string]: PropEntry;
          }
        | undefined;
}
/**
 * An annotation, a band, a line, a text or a circle at values of the dims, e.g. { "type": "band", "x": ["2025-07-01", null], "label": "Schätzung" }.
 */
export interface Annotation {
    type: 'band' | 'line' | 'text' | 'circle';
    props?: Props;
    /**
     * A label of a band or a line, a template of the globals.
     */
    label?: string | InLanguages;
    /**
     * The text of a text, a template of the globals.
     */
    text?: string | InLanguages;
    /**
     * Above the marks, below them by default, as layer above.
     */
    above?: boolean;
    /**
     * Below the marks and the axes (default) or above all marks.
     */
    layer?: 'below' | 'above';
    /**
     * The name of the annotation in the legend (a template of the globals), with a symbol of it: a vertical line of a line at a value of x, a horizontal one of y, a box of a band, a dot of a circle; one entry per name, after the legends of the dims.
     */
    legend?: string;
    /**
     * Right before the mark of this id, in its layer, e.g. lines above the bars but below the labels whose halo cuts them.
     */
    before?: string;
    /**
     * The facets of the annotation, a key or a list of them, all by default; of a grid also the values of the dims of its rows and columns, e.g. { "group": "Bau" } (a column, a row or a cell).
     */
    facet?: {
        [k: string]: unknown;
    };
    /**
     * The longitude of a map.
     */
    lon?: number;
    /**
     * The latitude of a map.
     */
    lat?: number;
    /**
     * A value or a range [from, to] of the dim, a reference to a global, e.g. "@target", or an expression, null is no value, of a range the edge of the domain.
     */
    [k: string]:
        | DomainValue
        | [DomainValue, DomainValue]
        | 'band'
        | 'line'
        | 'text'
        | 'circle'
        | Props
        | string
        | InLanguages
        | boolean
        | 'below'
        | 'above'
        | {
              [k: string]: unknown;
          }
        | number
        | undefined;
}
/**
 * A plot per category of a dim, or a grid of two dims.
 */
export interface Facets {
    /**
     * The dim of the facets, or the dims of the rows and the columns of a grid.
     */
    by?:
        | string
        | {
              /**
               * The dim of the rows of a grid, its categories are the rows (their names the headers beside them).
               */
              rows?: string;
              /**
               * The dim of the columns of a grid, its categories are the columns (their names the headers above them).
               */
              cols?: string;
          };
    /**
     * A number, a reference "@name", e.g. to a global, or an expression, e.g. of totalWidth.
     */
    cols?: number | `=${string}` | `@${string}` | Expression;
    /**
     * The headers of the rows of a grid: right of them vertical (default), left of them horizontal, in a column of the width of the longest one, or { "side": "left", "vertical": true }, e.g. as a title of an axis.
     */
    rowHeaders?:
        | (`=${string}` | ('left' | 'right'))
        | {
              /**
               * Left or right of the rows.
               */
              side?: 'left' | 'right';
              /**
               * Vertical text (upwards at the left, downwards at the right), by default at the right; horizontal text is in a column of the width of the longest header.
               */
              vertical?: boolean;
          };
    /**
     * The titles of the axes in every facet (all) or only at the outer ones (outer): of the bottom axis in the bottom row, of the left one in the first column, of the right one in the last column, of the top one in the first row.
     */
    axisTitles?: `=${string}` | ('all' | 'outer');
    /**
     * The titles of the facets (.vis-facet-title).
     */
    title?: {
        props?: Props1;
    };
    /**
     * The scales of the facets, own (default), shared, the dims which share their scale, of a grid an object of the dims and all, row or col, or an expression of a global.
     */
    scales?:
        | (`=${string}` | ('own' | 'shared'))
        | string[]
        | {
              [k: string]: 'all' | 'row' | 'col';
          }
        | `=${string}`
        | `@${string}`
        | Expression;
}
/**
 * Svg attributes (and text), values, references "@name", expressions or nested props, e.g. d of a path.
 */
export interface Props1 {
    [k: string]: PropEntry;
}
/**
 * The geometry of a map (coord geo), the rows are joined to its features.
 */
export interface Geo {
    /**
     * Url of GeoJSON or TopoJSON, relative to the definition, or the GeoJSON or TopoJSON itself.
     */
    data?:
        | string
        | {
              [k: string]: unknown;
          };
    /**
     * The object of TopoJSON, the first one by default.
     */
    object?: string;
    /**
     * The key of the features, id (default) or a property, e.g. NUTS_ID.
     */
    key?: string;
    /**
     * The property of the names of the features, name by default.
     */
    name?: string;
    /**
     * The dim whose values are the keys of the features.
     */
    join?: string;
    /**
     * Only the features of these keys, e.g. the countries of the EU.
     */
    include?: Key[];
    /**
     * The features of these keys are not drawn at all, e.g. ["RU", "BY"].
     */
    exclude?: Key[];
    /**
     * A d3 projection (type, mercator by default) and its parameters, e.g. rotate, center or parallels.
     */
    projection?: {
        type?:
            | `=${string}`
            | (
                  | 'albers'
                  | 'albersUsa'
                  | 'azimuthalEqualArea'
                  | 'azimuthalEquidistant'
                  | 'conicConformal'
                  | 'conicEqualArea'
                  | 'conicEquidistant'
                  | 'equalEarth'
                  | 'equirectangular'
                  | 'gnomonic'
                  | 'identity'
                  | 'mercator'
                  | 'naturalEarth1'
                  | 'orthographic'
                  | 'stereographic'
                  | 'transverseMercator'
              );
        [k: string]: unknown;
    };
    /**
     * The features the projection is fitted to, all (default), the ones with data or a list of keys.
     */
    fit?: (`=${string}` | ('all' | 'data')) | Key[];
}
