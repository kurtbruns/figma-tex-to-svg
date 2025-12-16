const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlInlineCssWebpackPlugin = require('html-inline-css-webpack-plugin').default;
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');


module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  /** --- Code (plugin controller) build --- */
  const code = {
    name: 'code',
    mode: isProd ? 'production' : 'development',
    // This is necessary because Figma's 'eval' works differently than normal eval
    devtool: isProd ? false : 'inline-source-map',
    entry: {
      code: './src/code.ts', // This is the entry point for our plugin code.
    },
    module: {
      rules: [
        // Converts TypeScript code to JavaScript
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    // Webpack tries these extensions for you if you omit the extension like "import './file'"
    resolve: {
      extensions: ['.ts', '.js'],
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'dist'),
    },
  };

  /** --- UI (iframe / HTML) build + dev server --- */
  const ui = {
    name: 'ui',
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? false : 'inline-source-map',
    entry: path.resolve(__dirname, 'src/ui/index.ts'),
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.s?css$/,
          use: [
            // Extract CSS to a file for inlining (works in both dev and prod)
            MiniCssExtractPlugin.loader,
            'css-loader',
            'sass-loader',
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    output: {
      filename: 'ui.[contenthash].js',
      path: path.resolve(__dirname, 'dist'),
      clean: false,
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'src/ui/index.html'),
        filename: 'index.html',
        inject: 'body', // Inject scripts at the end of <body> where the comment indicates
        scriptLoading: 'blocking',
        minify: isProd,
      }),
      // Extract CSS and inline it (works in both dev and prod)
      // No content hash needed since CSS is inlined into HTML
      new MiniCssExtractPlugin({
        filename: 'ui.css',
      }),
      // Inline the extracted CSS into the HTML
      new HtmlInlineCssWebpackPlugin(),
      // Inline JavaScript into the HTML (required for Figma plugins)
      new HtmlInlineScriptPlugin(),
    ],
  };

  // Multi-compiler export: run both builds together
  return [code, ui];
};

