/**
 * The props of a definition, the values of most of its parts, are the
 * expressions of utils/expr.js: values, references "@name" to a name of the
 * place of the prop (e.g. a global or a value of the row), operators, e.g.
 * { "*": ["@innerWidth", 0.5] }, and nested props, e.g. `d` of a line. A
 * prop is compiled once, then evaluated with a scope (the values of the
 * names) or bound to the rows of a plot, see `bind`.
 */
export { compile, evaluate, bind, constant, refNames, refOf, formatter } from '@/utils/expr';
