const baseConfig = require('./_base.js');
const { merge } = require('webpack-merge');

module.exports = merge(baseConfig, {
    entry: {
        main: './src/index.js',
    },
    mode: 'development',
    output: {
        filename: 'index.js',
        library: {
            type: "module",
        },
    },
    experiments: {
        outputModule: true,
    },
});
