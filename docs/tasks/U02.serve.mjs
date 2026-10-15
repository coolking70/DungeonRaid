// Stable dev server for acceptance while parallel art/localization tasks write new files.
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 5314, strictPort: true, watch: null } });
await server.listen(); server.printUrls();
