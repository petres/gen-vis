// the types of the definitions, generated of schema.json by `npm run types`, see scripts/types.js

/**
 * A key of a feature of a map or of a category, compared as a string.
 */
export type Key = string | number;
export type PropEntry =
    | Value
    | {
          [k: string]: PropEntry;
      };
/**
 * A fixed value, a reference "@name" or a computed prop.
 */
export type Value = string | number | boolean | null | Prop;
/**
 * A computed value: a reference, a ratio of a reference plus an offset, steps based on a reference, a reference as a text of a format or the prop of the case of the value of a reference. Instead of a reference the derived props can have a prop (of). The prop is required unless the object is merged into a prop of the parent definition.
 */
export type Prop = {
    prop?: 'fixed' | 'ref' | 'relative' | 'steps' | 'format' | 'match';
    /**
     * The d3 format of a format prop, e.g. ",.1f" or "%Y" of dates, in the locale.
     */
    format?: string;
    /**
     * e.g. totalWidth or a global, in a facet also innerWidth or innerHeight
     */
    ref?: string;
    /**
     * A prop whose value is used instead of the one of a reference, e.g. a steps prop of a relative one.
     */
    of?: {
        [k: string]: unknown;
    };
    /**
     * The factor of a relative prop, 1 by default.
     */
    ratio?: number;
    /**
     * Added to a relative prop, e.g. pixels of a position, 0 by default.
     */
    offset?: number;
    /**
     * The value of the last step with a cut below the reference.
     */
    steps?: {
        cut: number;
        value: unknown;
    }[];
    /**
     * The props of a match prop by the value of the reference (as a text), e.g. of the categories.
     */
    cases?: {
        [k: string]: unknown;
    };
    /**
     * The prop of a match prop of other values, null by default.
     */
    default?: {
        [k: string]: unknown;
    };
    /**
     * The value of a fixed prop, e.g. an object which is not a nested prop.
     */
    value?: {
        [k: string]: unknown;
    };
};
/**
 * A value of a mapping, e.g. a date of a string, a reference "@name", e.g. to a global, or a computed prop, null is taken from the data.
 */
export type DomainValue = number | string | null | Prop;
/**
 * Moves the hover by [x, y] pixels.
 *
 * @minItems 2
 * @maxItems 2
 */
export type Pair = [number | null, number | null];
/**
 * A number, a reference "@name", e.g. to a global, or a computed prop, e.g. based on totalWidth.
 */
export type NumberValue = number | string | Prop;
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
           * The titles of the buttons and the texts of screen readers.
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
               * The kind of a facet with a hover, e.g. chart.
               */
              chart?: string;
              /**
               * The description of the keys of the hover.
               */
              keys?: string;
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
 * Extends the domain relative to its size.
 *
 * @minItems 2
 * @maxItems 2
 */
export type Pair1 = [number | null, number | null];
/**
 * Extends the domain by absolute values.
 *
 * @minItems 2
 * @maxItems 2
 */
export type Pair2 = [number | null, number | null];
/**
 * Removes the part of a parent.
 */
export type None = null;
export type FormElementValues = {
    id: string;
    name?: string;
    value?: unknown;
    /**
     * Globals which are set when the entry is selected, e.g. a name used by the texts.
     */
    globals?: {
        [k: string]: unknown;
    };
    /**
     * Patches the definition while the entry is selected, merged in the order of the form elements, null removes a part.
     */
    patch?: {
        options?: Options;
        mapping?: Mapping;
        plot?: (Plot | Plot[]) | null;
        annotations?: (Annotation | Annotation[]) | null;
        filter?: Filter | null;
        facets?: Facets | null;
        geo?: Geo | null;
        transform?: (Transform | Transform[]) | null;
    };
}[];

/**
 * A chart of gen-vis 3, see https://github.com/petres/gen-vis. A definition can be a part which is merged into its parent, so no entry is required.
 */
export interface GenVisDefinition {
    $schema?: string;
    /**
     * Url of the definition this one is deep merged into, relative to this definition, or a list of them (mixins) merged in their order, later ones override earlier ones. Arrays are replaced, not merged.
     */
    parent?: string | string[];
    /**
     * Url of the data, relative to the definition, CSV, TSV, JSON or parquet, by the extension or dataFormat.
     */
    data?: string;
    /**
     * The format of the data, by default the one of the extension of its url, without one CSV or JSON by the content.
     */
    dataFormat?: 'csv' | 'tsv' | 'json' | 'parquet';
    geo?: Geo;
    /**
     * An annotation or a list of them, bands, lines, texts and circles at values of the mappings, e.g. { "type": "band", "x": ["2025-07-01", null], "label": "Schätzung" }.
     */
    annotations?: Annotation | Annotation[];
    /**
     * Columns computed of the data, e.g. an index of a base year, in their order, see the readme.
     */
    transform?: Transform | Transform[];
    filter?: Filter;
    options?: Options;
    /**
     * Values changed by the form elements, e.g. the shared scales of the facets.
     */
    globals?: {
        [k: string]: unknown;
    };
    mapping?: Mapping;
    /**
     * A plot or a list of plots, drawn in order.
     */
    plot?: Plot | Plot[];
    facets?: Facets;
    formElements?: FormElement[];
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
     * The mapping whose values are the keys of the features.
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
            | 'transverseMercator';
        [k: string]: unknown;
    };
    /**
     * The features the projection is fitted to, all (default), the ones with data or a list of keys.
     */
    fit?: ('all' | 'data') | Key[];
}
export interface Annotation {
    type: 'band' | 'line' | 'text' | 'circle';
    props?: Props;
    /**
     * A label of a band or a line, a template of the globals.
     */
    label?: string;
    /**
     * The text of a text, a template of the globals.
     */
    text?: string;
    /**
     * Above the plots, below them by default.
     */
    above?: boolean;
    /**
     * The facets of the annotation, a key or a list of them, all by default.
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
     * A value or a range [from, to] of the mapping, a reference to a global, e.g. "@target", or a computed prop, null is no value, of a range the edge of the domain.
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
        | boolean
        | {
              [k: string]: unknown;
          }
        | number
        | undefined;
}
/**
 * Svg attributes (and text), values are fixed, references "@name", computed props or nested props, e.g. d of a path.
 */
export interface Props {
    [k: string]: PropEntry;
}
export interface Transform {
    /**
     * year: the year of a date, align: the date in the year `year`, index: relative to the mean of the base, mean: the mean of the base (all rows by default) of the group, share: of the sum of the group, rolling: the mean of `size` rows, cumulative: the sum up to the row, calc: the values of `columns` combined by `op`, rank: the rank in the group, lookup: the `value` of the row of a file of `data` of the `key`.
     */
    type: 'year' | 'align' | 'index' | 'mean' | 'share' | 'rolling' | 'cumulative' | 'calc' | 'rank' | 'lookup';
    /**
     * The column of the values, a template of the globals, of a lookup the one of the keys.
     */
    column?: string;
    /**
     * calc: the columns of the values, combined from the first one.
     */
    columns?: string[];
    /**
     * calc: the operation of the values of the columns, min and max the least and the largest one.
     */
    op?: 'add' | 'subtract' | 'multiply' | 'divide' | 'min' | 'max';
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
     * lookup: the column of the keys of the rows of the file.
     */
    key?: string;
    /**
     * lookup: the column of the values of the rows of the file, a template of the globals, e.g. "name_{lang}".
     */
    value?: string;
    /**
     * The name of the new column, by default the one of `column`, which it replaces.
     */
    as?: string;
    /**
     * The groups of the rows of the same values of these columns, e.g. a line per category.
     */
    by?: string | string[];
    /**
     * The column of the order of the rows of rolling and cumulative, e.g. the date, the order of the rows by default.
     */
    order?: string;
    /**
     * The rows of the base of an index or of a mean: a column and its value, e.g. { "year": "{base}" }, or a range [from, to], e.g. of dates or years, { "year": [1961, 1990] }.
     */
    base?: {
        [k: string]: unknown;
    };
    /**
     * The value of the base of an index (100 by default), the factor of calc (1 by default).
     */
    scale?: number;
    /**
     * The number of the rows of the window of rolling.
     */
    size?: number;
    /**
     * The window of rolling: the rows before the row (end, by default) or around it.
     */
    align?: 'end' | 'center';
    /**
     * The year of align, 2020 by default.
     */
    year?: number;
}
/**
 * The rows of the conditions of mappings: a value or a list of values, e.g. a global of a form element { "year": "@year" }, null (no value), { "not": ... } or { "range": [from, to] } (null is open).
 */
export interface Filter {
    [k: string]: unknown;
}
export interface Options {
    title?: string;
    subtitle?: string;
    /**
     * HTML, e.g. a link of the source, a template of the globals, their values are text.
     */
    footer?: string;
    /**
     * A text instead of the plots and the legends, a template and a prop of the globals and totalWidth, e.g. steps of a narrow screen, null or an empty text for the plots.
     */
    message?: string | null | Prop;
    /**
     * A text instead of the plots if there are no rows, e.g. of a filter, a template of the globals.
     */
    empty?: string;
    /**
     * The class of the element of the visualisation (vis), a template of the globals, e.g. for the styles of a page.
     */
    class?: string;
    /**
     * The elements move to their new values in this many milliseconds (true for 300) after a change of a legend, a form element or the state.
     */
    transition?: number | boolean;
    /**
     * The highlight of the elements, see the highlight- and others- props of the plots.
     */
    highlight?: {
        /**
         * The attributes move to the ones of the highlight in this many milliseconds, e.g. 50.
         */
        transition?: number;
    };
    /**
     * The content of the hover without the hover slot, templates of html, their values are text.
     */
    hover?: {
        /**
         * The rows of the nearest position of the axis (position, by default) or the row of the nearest point, e.g. of a scatter plot.
         */
        mode?: 'position' | 'point';
        /**
         * The distance of the nearest point in pixels, 30 by default.
         */
        radius?: number;
        filter?: Filter1;
        /**
         * false: no box of the hover, its highlight and the events stay, e.g. a hover of the highlight only.
         */
        box?: boolean;
        /**
         * false: no line of the position of the hover.
         */
        marker?: boolean;
        /**
         * true: a hover also without rows, e.g. the name of a region without a value.
         */
        empty?: boolean;
        /**
         * The hover is beside the marker of the position (or the center of a region) or at the pointer.
         */
        position?: 'marker' | 'pointer';
        /**
         * The side of the hover, by default the one with more space, center on the position, e.g. in the center of a polar plot.
         */
        side?: 'left' | 'right' | 'above' | 'below' | 'center';
        offset?: Pair;
        /**
         * The area of the hover, the plot area or the facet with its margins, e.g. the labels of the rows of horizontal bars.
         */
        area?: 'plot' | 'facet';
        /**
         * The title, {title} is the default one, e.g. the date, and the globals.
         */
        title?: string;
        /**
         * A row instead of the table: {land} the name of a category, {land.unit} another hover prop, {y} the formatted value, {y.value} the value, and the globals.
         */
        row?: string;
    };
    /**
     * The width of the container if not given.
     */
    width?: number;
    /**
     * The height of a facet in pixels, 400 by default.
     */
    height?: number | string | Prop;
    margins?: {
        top?: NumberValue;
        right?: NumberValue;
        bottom?: NumberValue;
        left?: NumberValue;
    };
    locale?: Locale;
    /**
     * The coordinate system of the plots, cartesian (a horizontal and a vertical axis) by default, polar (an angle and a radius) or geo (a map).
     */
    coord?: 'cartesian' | 'polar' | 'geo';
    /**
     * Css font-family, by default the css variable --gen-vis-font-family or Century Gothic.
     */
    fontFamily?: string;
}
/**
 * The rows of the conditions of mappings: a value or a list of values, e.g. a global of a form element { "year": "@year" }, null (no value), { "not": ... } or { "range": [from, to] } (null is open).
 */
export interface Filter1 {
    [k: string]: unknown;
}
/**
 * Maps columns of the data to named dimensions, the plots and all other parts of the definition refer to these names, null removes a mapping, e.g. of a parent.
 */
export interface Mapping {
    [k: string]: MappingEntry | None;
}
export interface MappingEntry {
    /**
     * The column of the data, can be a template of globals, e.g. "{values}{share}", see formElements.
     */
    column?: string;
    /**
     * The title of the legend.
     */
    name?: string;
    /**
     * Missing and invalid numeric and date values are null, dates are timestamps or strings, a date without a time zone, e.g. 2024-06-01 or 01.06.2024 13:00, is the one of the time zone of the scale, local or UTC (utc). Categorical values (also of a mapping without a type) are strings of every format of the data, e.g. "2004" of the number 2004 of JSON or parquet.
     */
    type?: 'numeric' | 'date' | 'categorical';
    /**
     * Stacks the values of the axis of the values, a vertical, a horizontal (of horizontal bars), a radial or an angular one (of pies, polar:arc from @<name>:start:scaled to @<name>:end:scaled), true all rows or the conditions of mappings of the rows which are stacked, as the ones of filter, e.g. { "type": { "not": "load" } }, the others have their own value as start and end, e.g. a line of a total on stacked areas.
     */
    stacked?: boolean | Filter;
    scale?: Scale | None;
    axis?: Axis | None;
    hover?:
        | None
        | {
              /**
               * By default the format of the axis.
               */
              format?: string;
              /**
               * The columns of the entries of a categorical mapping, name by default.
               */
              props?: {
                  [k: string]: Value;
              };
              /**
               * The rows of the hover of the categories of a categorical mapping.
               */
              row?: {
                  /**
                   * CSS properties of the row of a category, props of the props of the categories, e.g. { "font-style": "@hoverStyle" }, the nearest row stays bold.
                   */
                  props?: {
                      [k: string]: Value;
                  };
              };
          };
    legend?:
        | None
        | {
              /**
               * The place of the legend, above or below the plots or beside them, the plots have the rest of the width, a prop of totalWidth (the width of the visualisation), e.g. below the plots of a phone.
               */
              position?: ('top' | 'bottom' | 'left' | 'right') | Prop;
              /**
               * The direction of the scale of the colors, a vertical one has the high values at the top, a prop of totalWidth (the width of the visualisation).
               */
              orientation?: ('horizontal' | 'vertical') | Prop;
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
              labels?: 'before' | 'after';
              /**
               * The format of the values of the colors of a scale, by default the one of the hover.
               */
              format?: string;
              /**
               * An entry of the regions without a value beside the colors of a scale, e.g. { "name": "no data", "color": "#EEE" }.
               */
              missing?: {
                  name: string;
                  /**
                   * By default #EEE.
                   */
                  color?: string;
              };
              /**
               * The symbol before the name of a category: line, rect or circle in its color, or the svg elements.
               */
              symbol?:
                  | ('line' | 'rect' | 'circle')
                  | {
                        type: 'line' | 'rect' | 'circle';
                        size?: number;
                        props?: Props;
                    }
                  | SymbolElements;
              props?: {
                  [k: string]: Value;
              };
          };
    props?:
        | None
        | {
              common?: CategoryProps;
              /**
               * The categories by their key (the value of the column) and their props, in the order of the legend, the facets and the stacks.
               */
              categories?: {
                  [k: string]: CategoryProps;
              };
              /**
               * The values of the column which are not in categories are categories as well, after them, in ascending order.
               */
              fromData?: boolean;
              /**
               * The order of the categories: the one of categories (keys which are integers ascending first), ascending, descending (numbers by their value) or a list of keys which are first.
               */
              order?: ('ascending' | 'descending') | Key[];
              /**
               * The props of the categories by their rank in the order: of the first one, the second one, ..., the last entry is the one of all others, e.g. the newest year red.
               */
              ranks?: CategoryProps[];
              /**
               * The colors of the categories in their order as the prop color, a d3 scheme, e.g. Tableau10.
               */
              scheme?: string;
          };
}
export interface Scale {
    /**
     * The scale of another mapping, e.g. "y", the values of this one are positions on it too, e.g. the other end of a band, and they are in its domain, without the other parts of a scale.
     */
    of?: string;
    /**
     * A d3 scale, continuous scales and the ones of classes (quantize, quantile, threshold) need a numeric or date mapping, point and band a categorical one, ordinal ones are of any values, e.g. colors of categories, positions of dates need a time or utc scale.
     */
    type?:
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
        | 'utc';
    /**
     * Places the scale on the plot, horizontal and vertical in the cartesian coordinate system, angular and radial in the polar one.
     */
    orientation?: 'horizontal' | 'vertical' | 'angular' | 'radial';
    /**
     * Fixes the domain, a null first or last entry is taken from the data, the values are converted as the ones of the data, e.g. dates, and can be references, e.g. to a global. A diverging scale has a middle entry, a threshold scale the values between its classes, a point or band scale its categories in their order.
     *
     * @minItems 1
     */
    domain?: [DomainValue, ...DomainValue[]];
    /**
     * Values the domain taken from the data includes, e.g. 0 or 100, a value or a list, also references.
     */
    include?: DomainValue | DomainValue[];
    /**
     * A value of a mapping, e.g. a date of a string, a reference "@name", e.g. to a global, or a computed prop, null is taken from the data.
     */
    center?: number | string | null | Prop;
    /**
     * The end of the classes of a threshold scale they include, the lower one (left, value >= limit) or the upper one (right, value > limit).
     */
    closed?: 'left' | 'right';
    domainRel?: Pair1;
    domainAbs?: Pair2;
    /**
     * Rounds the ends of the domain taken from the data, e.g. 0.951 to 1, true for steps of about a tenth of the domain or the number of steps.
     */
    nice?: boolean | number;
    /**
     * By default the width or height of the plot, e.g. colors, references to the sizes of the coordinate system, e.g. "@radius".
     */
    range?: (number | string | Prop)[];
    /**
     * For categorical scales, of a point scale of angles the place of the first category in steps, half a step after the top by default, 0 at the top, e.g. of a radar chart.
     */
    padding?: number;
    /**
     * A number, a reference "@name", e.g. to a global, or a computed prop, e.g. based on totalWidth.
     */
    step?: number | string | Prop;
    /**
     * The order of the categories of the data of a band, point or ordinal scale: of the rows (default), ascending, descending or by the value of a mapping of their first row, e.g. bars by their length.
     */
    order?:
        | ('ascending' | 'descending')
        | {
              by: string;
              descending?: boolean;
          };
    /**
     * The categories of a band or point scale in groups of the values of a mapping of their rows, with a space between the groups.
     */
    groups?: {
        /**
         * The mapping of the groups, e.g. a column of the group of a row.
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
    inset?: NumberValue | [NumberValue, NumberValue];
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
export interface Axis {
    /**
     * top, bottom, left or right of the cartesian coordinate system, angular (around the circle) or radial (from the center) of the polar one.
     */
    position?: 'top' | 'bottom' | 'left' | 'right' | 'angular' | 'radial';
    /**
     * The angle of a radial axis in degrees, clockwise from the top, 0 by default.
     */
    angle?: number;
    /**
     * The grid lines of a radial axis, circles or polygons through the ticks of the angle, e.g. of radar charts.
     */
    gridShape?: 'circle' | 'polygon';
    /**
     * The number of the ticks, null for the ones of tickSpacing, e.g. of a parent.
     */
    ticks?: NumberValue | None;
    /**
     * A number, a reference "@name", e.g. to a global, or a computed prop, e.g. based on totalWidth.
     */
    tickSpacing?: number | string | Prop;
    /**
     * Fixed ticks, converted as the values of the data, categories as strings, e.g. [2004, 2008] or ["2004", "2008"] of the years of any format of the data, the ones outside of the domain or which are no category of a band or point scale are left out, also a prop, e.g. steps of totalWidth.
     */
    values?: unknown[] | Prop;
    /**
     * A d3 number or time format.
     */
    format?: string;
    /**
     * The props of the labels of the ticks (svg attributes and text), of the props of the categories of the tick and of the mappings of the categories of its row, its values and the names of the facet, e.g. { "categories": ["level"], "props": { "font-weight": "@weight", "text": "@short", "max-width": 300 } }, of all axes, e.g. { "props": { "fill": "#777", "font-size": 10, "stroke-width": 2 } } of the values of a radial axis in the background, the stroke and its width replace the halo of the labels of radial axes.
     */
    labels?: {
        categories?: string | string[];
        props?: Props;
    };
    /**
     * The tick marks: false leaves them out (the labels stay at their places), their length (size, 9 pixels across the line of cartesian axes, 6 outside of the circle of angular ones by default, the labels move with it) and their props (svg attributes of the names of the facet), e.g. { "props": { "stroke": "var(--gen-vis-grid-color)" } }, radial axes have none.
     */
    tickMarks?:
        | false
        | {
              size?: number;
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
     * Lines at the ticks.
     */
    grid?: boolean;
    title?: {
        name?: string;
        /**
         * The distance from the axis in pixels, by default near the edge of the margin.
         */
        offset?: number;
    };
    padding?: number;
}
export interface SymbolElements {
    size?: number;
    elements?: {
        /**
         * An svg element, e.g. line or circle.
         */
        type: string;
        props?: Props;
    }[];
}
export interface CategoryProps {
    /**
     * The key by default.
     */
    name?: string;
    visible?: boolean;
    /**
     * false: the category has no entry in the legend, it stays visible, e.g. headers.
     */
    legend?: boolean;
    [k: string]: unknown;
}
export interface Plot {
    /**
     * The svg types draw an svg element per row in any coordinate system, the others are the ones of their coordinate system, the lines and areas a path per group, geo:base all features, geo:mesh the borders of an object of TopoJSON as one path, the others an element per row. The annotation types draw an annotation per row, e.g. of events, see annotations.
     */
    type?:
        | 'svg:circle'
        | 'svg:line'
        | 'svg:rect'
        | 'svg:text'
        | 'cartesian:line'
        | 'cartesian:area'
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
        | 'annotation:circle';
    /**
     * The class and the data-plot of the group of the plot, plot-<index> by default, the plots of a parent are merged by their ids.
     */
    id?: string;
    /**
     * Rows of the plot instead of the ones of the data, e.g. events, with the names of the mappings and others, e.g. a label, or the url of a file of them. The values of rows of the definition are props, e.g. references to globals.
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
    filter?: Filter2;
    /**
     * One row of every group: the first or the last one, or the one with the least or the most value of a mapping, e.g. labels at the ends of lines.
     */
    select?:
        | ('first' | 'last')
        | {
              min?: string;
              max?: string;
          };
    /**
     * geo:mesh: the object of the TopoJSON of the borders, the one of the geometry by default, e.g. the states above the districts.
     */
    object?: string;
    /**
     * geo:mesh: all borders, the ones between two features (inner) or the outline (outer).
     */
    borders?: 'all' | 'inner' | 'outer';
    /**
     * svg:text: the texts are moved apart vertically to at least this distance, e.g. labels at the ends of lines; polar:text: the texts of the same angle along the radius.
     */
    dodge?: number;
    /**
     * svg:text, polar:text: a halo behind the texts in the color of --gen-vis-halo-color, true (3 pixels) or its width, the props of the plot replace its stroke props.
     */
    halo?: boolean | number;
    /**
     * below: below the axes and grid lines, above: above the other plots, between them by default.
     */
    layer?: 'below' | 'above';
    /**
     * The facets of the plot, a key or a list of them, all by default.
     */
    facet?: {
        [k: string]: unknown;
    };
    /**
     * The elements with the highlight- props, the ones of the category of the hover (group, default) or only the one of its row (row), e.g. a segment of a stacked bar.
     */
    highlight?: 'group' | 'row';
    /**
     * The interpolation of the paths and areas between their points, monotoneX is smooth without overshooting the values, the closed ones connect the last point with the first one, e.g. of radar charts.
     */
    curve?:
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
        | 'basisClosed';
    /**
     * The rows are grouped by this mapping or these mappings, the props of their categories are available in the props.
     */
    categories?: string | string[];
    props?: Props;
}
/**
 * The rows of the conditions of mappings: a value or a list of values, e.g. a global of a form element { "year": "@year" }, null (no value), { "not": ... } or { "range": [from, to] } (null is open).
 */
export interface Filter2 {
    [k: string]: unknown;
}
export interface Facets {
    /**
     * A plot for every category of this mapping.
     */
    dim?: string;
    /**
     * A number, a reference "@name", e.g. to a global, or a computed prop, e.g. based on totalWidth.
     */
    cols?: number | string | Prop;
    /**
     * The mappings which share their scale across all facets, or a reference to a global.
     */
    scales?: string[] | string | Prop;
}
/**
 * Entries of a parent are patched by their id, so only the id is required.
 */
export interface FormElement {
    id: string;
    name?: string;
    /**
     * The global which is changed.
     */
    ref?: string;
    /**
     * Radio buttons, a drop down list, a slider over the entries or hidden, the global is set by the page (the prop globals).
     */
    type?: 'radio' | 'select' | 'slider' | 'hidden';
    /**
     * The selection is named below the subtitle of the PNG, false for ones which only change the presentation, e.g. shared scales.
     */
    inImage?: boolean;
    values?:
        | FormElementValues
        | {
              column: string;
          };
}
