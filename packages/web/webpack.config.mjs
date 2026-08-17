import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

const indexHtml = fs.readFileSync(path.resolve(directory, 'public/index.html'), 'utf8');

class HtmlShellPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('HtmlShellPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'HtmlShellPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          compilation.emitAsset('index.html', new compiler.webpack.sources.RawSource(indexHtml));
        },
      );
    });
  }
}

export default {
  mode: process.env['NODE_ENV'] === 'production' ? 'production' : 'development',
  entry: path.resolve(directory, 'src/client.tsx'),
  output: {
    path: path.resolve(directory, 'dist'),
    filename: 'client.js',
    clean: true,
  },
  plugins: [new HtmlShellPlugin()],
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: {
      '@novel-enginner/services': path.resolve(directory, '../services/src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'swc-loader',
          options: {
            configFile: path.resolve(directory, '.swcrc'),
          },
        },
      },
    ],
  },
  devtool: 'source-map',
  devServer: {
    static: path.resolve(directory, 'dist'),
    port: Number.parseInt(process.env['WEB_PORT'] ?? process.env['WEB_ASSET_PORT'] ?? '3001', 10),
    hot: true,
    historyApiFallback: true,
    proxy: [
      {
        context: ['/api'],
        target: process.env['SERVICE_URL'] ?? 'http://localhost:3000',
        pathRewrite: { '^/api': '' },
        ws: true,
      },
    ],
  },
};