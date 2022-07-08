const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const RemoveEmptyScriptsPlugin = require('webpack-remove-empty-scripts');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { VueLoaderPlugin } = require('vue-loader')

const path = require('path')
const resolve = (dir) => path.join(__dirname, '..', dir)

module.exports = {
    entry: {
        main: './src/main.js',
        style: './assets/styles/main.scss'
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
        // }, {
        //     test: /\.js$/,
        //     exclude: /node_modules/,
        //     use: ['babel-loader']
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
            filename: 'index.html',
            template: 'index.html'
        }),
        new VueLoaderPlugin(),
    ],
    output: {
        publicPath: '/'
    }
};
