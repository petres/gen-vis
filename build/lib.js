const { VueLoaderPlugin } = require('vue-loader')

const path = require('path')
const resolve = (dir) => path.join(__dirname, '..', dir)

module.exports = {
    entry: {
        main: './src/lib.js',
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
        new VueLoaderPlugin(),
        new HtmlWebpackPlugin({
            filename: 'index.html',
            template: 'test.html'
        }),
    ],
    output: {
        publicPath: '/'
    }
};
