const path = require('path');
const LicenseWebpackPlugin = require('license-webpack-plugin').LicenseWebpackPlugin;

module.exports = {
  entry: './src/nammd.ts',
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ],
  },
  output: {
    filename: 'nammd.js',
    path: path.resolve(__dirname, 'docs/master/'),
  },
  devServer: {
    contentBase: path.join(__dirname, 'docs'),
    contentBasePublicPath: "/nammd/",
    host: "0.0.0.0",
    port: 8080,
  },
  plugins: [
    new LicenseWebpackPlugin({
      outputFilename: './licenses.txt',
      addBanner: true,
      licenseFileOverrides: {
        isarray: '../../licenses/isarray.txt',
      },
    })
  ]
};

