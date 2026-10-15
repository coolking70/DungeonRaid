import { createServer } from 'vite';
const server = await createServer({server:{host:'127.0.0.1',port:5316,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});
await server.listen();server.printUrls();
