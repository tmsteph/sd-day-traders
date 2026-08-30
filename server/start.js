const http = require('node:http');
const { createHttpHandler } = require('./http-handler');

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const handler = createHttpHandler();
http.createServer(handler).listen(port, host, () => {
  console.log(`SD Day Traders booking API listening on ${host}:${port}`);
});
