const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const RemoveEmptyScriptsPlugin = require('webpack-remove-empty-scripts');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { VueLoaderPlugin } = require('vue-loader')

const path = require('path')
const resolve = (dir) => path.join(__dirname, '..', dir)

module.exports = {
    entry: {
        dev: './src/main.js',
        style: './assets/styles/main.scss',
        lib: './src/lib.js'
    },
    module: {
        rules: [{
            test: /\.css$/i,
            use: [MiniCssExtractPlugin.loader, 'css-loader'],
        }, {
            test: /\.scss$/i,
            use: [MiniCssExtractPlugin.loader, 'css-loader', "sass-loader"],
        }, {
            test: /\.vue$/i,
            use: 'vue-loader'
        }]
    },
    resolve: {
        alias: {
            '@': resolve('src'),
        },
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: 'data', to: 'data' }
            ]
        }),
        new RemoveEmptyScriptsPlugin(),
        new MiniCssExtractPlugin({
            filename: '[name].[chunkhash].css'
        }),
        new HtmlWebpackPlugin({
            template: 'dev.html',
            chunks: ['dev', 'style']
        }),
        new HtmlWebpackPlugin({
            filename: 'lib.html',
            template: 'lib.html',
            chunks: ['lib']
        }),
        new VueLoaderPlugin(),
    ],
    output: {
        publicPath: '/'
    }
};
