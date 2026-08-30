const http = require('node:http');
const { createHttpHandler } = require('./http-handler');

const port = Number(process.env.PORT || 8787);
const handler = createHttpHandler();
http.createServer(handler).listen(port, '0.0.0.0', () => {
  console.log(`SD Day Traders booking API listening on ${port}`);
});
