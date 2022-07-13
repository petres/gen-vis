const baseConfig = require('./_base.js');
const { merge } = require('webpack-merge');
var package = require('../package.json');

module.exports = merge(baseConfig, {
    entry: {
        main: './src/lib.js',
    },
    mode: 'production',
    output: {
        publicPath: '/',
        filename: `gen-vis-${package.version}.js`
    },
});
