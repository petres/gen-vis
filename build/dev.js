const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const baseConfig = require('./_base.js');
const { merge } = require('webpack-merge');

module.exports = merge(baseConfig, {
    entry: {
        dev: './src/dev.js',
        lib: './src/lib.js'
    },
    mode: 'development',
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: 'data', to: 'data' }
            ]
        }),
        new HtmlWebpackPlugin({
            favicon: 'assets/icon.png',
            template: 'dev.html',
            chunks: ['dev']
        }),
        new HtmlWebpackPlugin({
            filename: 'lib.html',
            template: 'lib.html',
            chunks: ['lib']
        }),
    ],
    devServer: {
        historyApiFallback: {
          disableDotRule: true
        },
        open: true,
        liveReload: true,
        hot: false,
        watchFiles: ["data/**"]
    },
    devtool: 'source-map',
});
