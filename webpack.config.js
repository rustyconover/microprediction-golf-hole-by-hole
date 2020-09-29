const nodeBuiltins = require("builtin-modules");
const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
  entry: {
    Puller: path.resolve(__dirname, "src/index.ts"),
  },
  ///  devtool: "inline-source-map",
  mode: "production",
  externals: {
    ...nodeBuiltins,
  },
  target: "node",
  module: {
    rules: [
      {
        test: /\.node$/,
        use: "node-loader",
      },
      {
        test: /.ts$/,
        loader: "ts-loader",
        exclude: /node_modules/,
        options: {
          configFile: "tsconfig-webpack.json",
          transpileOnly: true,
        },
      },
    ],
  },
  optimization: {
    removeAvailableModules: true,
    removeEmptyChunks: true,
    splitChunks: false,
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          output: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
  resolve: {
    extensions: [".ts", ".ts", ".js"],
  },
  output: {
    libraryTarget: "commonjs2",
    path: path.resolve(__dirname, "dist"),
  },
};
