const { parentPort } = require('worker_threads');
const { getSessions } = require('./index');

parentPort.on('message', () => {
  try { parentPort.postMessage(getSessions()); }
  catch { parentPort.postMessage([]); }
});
