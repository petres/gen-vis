# To do: bugs and surprises which are left

From the outside review of 2026-11-12 and from the agents which fixed its findings. What was fixed is
in the CHANGELOG.

## Wrong results

- **A second stacked mark of another value dim draws nothing**, without a message: one stacked dim
  per chart, see "channels as strings" of [architecture.md](architecture.md). (Large with its cause;
  a warning of the check is small.)
- **A part which only a combination of two controls needs is not loaded**, see "the variants of the
  controls" of [architecture.md](architecture.md).
- **A dim of `type: "date"` with a band scale** is an error; a band per date works only as
  categories (without the type), which the check says now. A real band scale of dates touches the
  normalization, the language, the scales, the formats and the hover. (Medium, a design question.)
- **`labels.at: "axis"` draws the labels over negative bars** (documented now). Moving a label to
  the free side needs the values of the bars in the code of the axis. (Medium.)
- **`cumulative` sums plainly, `rolling` with a compensation**: 1 beside 1e17 gives different
  results of the two. Changing it changes results. (Small.)
- **The texts of html with `format()`**: the scope of html texts (`Store.textOf`) copies the scope
  by its entries and drops the formatter of the locale. Not verified. (Small.)
- **Separators of thousands in a CSV of semicolons** (`1.200` is read as 1.2): the check warns, a
  definition can not say how its numbers are written. An option of `dataFormat` (a separator of
  thousands) or a function `replace()` of the expressions. (Small to medium.)
- **`{group:name}` fields of the controls in the `text` of a mark** are not filled, the globals are.
  (Small.)

## Live behaviour

- **The box of the hover is placed once per content**: an image in the content of a slot which is
  loaded later is not measured again.
- **An error of an export of the CSV button** goes to the display of errors of the chart (the
  controls are kept).
- **`raise` moves the axes to the end of the facet and the next draw moves them back**: two moves of
  the DOM per draw; the group of the labels of the annotations is made anew at every draw. A flag
  "raised" through the coordinate systems and the facet. (Small, little gain.)
- **A content security policy of styles** (`nonce`): what still violates a strict policy is a
  `style` of the `props` of a mark and of the html of a definition (blocked, not applied) and the
  `<style>` elements of the exports (`export-svg.js`, `export.js`), which have no nonce.
- **The legend measures all entries in the font of the first one**: an entry with a font size of its
  own (`props`) gets its least width in the font of the legend.
- **With defaults of marks of the page or the chart, the compiled definition is not kept** at a
  change of a control (`withMarkDefaults` returns a new object per call): the cost of before, no
  wrong result.

## Not reproduced, or by design

- `order: {by: "<date dim>"}` of categories compares timestamps, not texts: no bug (a test says so).
- `compareCategories` and mixed keys: one order now (numbers by their value, then texts).
- A reversed `domain` (`[300, 100]`) is a reversed axis; a scheme in lower case is found.
