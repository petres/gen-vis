const baseConfig = require('./_base.js');
const { merge } = require('webpack-merge');

module.exports = merge(baseConfig, {
    entry: {
        main: './src/lib.js',
    },
    mode: 'production',
    output: {
        publicPath: '/',
        filename: 'gen-vis.js'
    },
});
