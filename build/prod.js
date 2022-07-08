const baseConfig = require('./base.js');
const { merge } = require('webpack-merge');
// const { DefinePlugin } = require('webpack')

module.exports = merge(baseConfig, {
    mode: 'production',
    output: {
        publicPath: '/',
        filename: '[name].[fullhash].js'
    },
});
