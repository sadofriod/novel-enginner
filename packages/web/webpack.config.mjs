import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: process.env['NODE_ENV'] === 'production' ? 'production' : 'development',
  entry: path.resolve(directory, 'src/client.tsx'),
  output: {
    path: path.resolve(directory, 'dist'),
    filename: 'client.js',
    clean: true,
  },
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
    port: Number.parseInt(process.env['WEB_ASSET_PORT'] ?? '3002', 10),
    hot: true,
    historyApiFallback: true,
    proxy: [
      {
        context: ['/api'],
        target: process.env['SERVICE_URL'] ?? 'http://localhost:3000',
      },
    ],
  },
};