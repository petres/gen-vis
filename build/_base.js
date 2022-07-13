const { VueLoaderPlugin } = require('vue-loader')

const path = require('path')
const resolve = (dir) => path.join(__dirname, '..', dir)

module.exports = {
    module: {
        rules: [{
            test: /\.css$/i,
            use: ['style-loader', 'css-loader'],
        }, {
            test: /\.scss$/i,
            use: ['style-loader', 'css-loader', "sass-loader"],
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
        new VueLoaderPlugin(),
    ],
    output: {
        publicPath: '/',
        filename: '[name].[fullhash].js'
    }
};
