import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const DATA_DIR = path.resolve(__dirname, 'data');
const PAGES_BASE = '/robotTwin/';

const DATA_MIME: Record<string, string> = {
  '.urdf': 'application/xml; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.dae': 'model/vnd.collada+xml',
  '.stl': 'model/stl',
  '.json': 'application/json; charset=utf-8',
};

// The catalog and meshes live in /data, which Vite does not emit by default.
// Serve them in dev and copy them into the Pages artifact so the same relative
// URLs work at https://zhuyanhe1975-hit.github.io/robotTwin/.
function robotDataPlugin(): Plugin {
  let outDir = path.resolve(__dirname, 'dist');

  const sendFile = (
    url: string | undefined,
    res: import('http').ServerResponse,
    next: () => void,
  ) => {
    if (!url?.startsWith('/data/')) {
      next();
      return;
    }
    const rel = decodeURIComponent(url.split('?')[0].slice('/data/'.length));
    if (!rel || rel.split('/').includes('..')) {
      next();
      return;
    }
    const filePath = path.resolve(DATA_DIR, rel);
    const rootWithSep = DATA_DIR.endsWith(path.sep) ? DATA_DIR : DATA_DIR + path.sep;
    if (!filePath.startsWith(rootWithSep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      next();
      return;
    }
    res.setHeader('Content-Type', DATA_MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  };

  return {
    name: 'robot-data',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => sendFile(req.url, res, next));
    },
    closeBundle() {
      fs.cpSync(DATA_DIR, path.join(outDir, 'data'), { recursive: true });
      fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Absent key stays an empty string so `vite build` succeeds with no .env.
  // A real key is only read from a local, gitignored env file.
  const geminiKey = env.GEMINI_API_KEY ?? '';
  return {
    // Dev stays at /. Production matches the GitHub Pages project path.
    // `npm run build -- --base <path>` still overrides this in Actions.
    base: mode === 'production' ? PAGES_BASE : '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), robotDataPlugin()],
    define: {
      'process.env.API_KEY': JSON.stringify(geminiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
