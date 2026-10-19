/*
 * Creates throwaway stubs for express / socket.io / mongodb in ./node_modules
 * so the NPC-kill harness can boot server.js without network, DB or ports.
 *
 *   node test/make-stubs.js      # before running the harness
 *   rm -rf node_modules/express node_modules/socket.io node_modules/mongodb
 *                              # AFTERwards — never leave these next to the
 *                              # real packages, they shadow the genuine modules.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'node_modules');

const expressStub = `const express = function () {
  return { use: () => {}, get: () => {}, post: () => {}, set: () => {}, disable: () => {}, all: () => {} };
};
express.static = () => (req, res, next) => next && next();
express.json = () => (req, res, next) => next && next();
express.urlencoded = () => (req, res, next) => next && next();
module.exports = express;
`;

const socketIoStub = `class FakeSocket {
  constructor(id) { this.id = id; this.rooms = new Set(); this.emitted = []; }
  emit(event, payload) { this.emitted.push({ event, payload }); return true; }
  join(room) { this.rooms.add(room); }
  on() {}
  to() { return { emit: () => {} }; }
  disconnect() {}
}
const __instances = [];
class Server {
  constructor() {
    const map = new Map();
    this.sockets = {
      sockets: map, _map: map, on: () => {}, use: () => {}, emit: () => {},
      to: () => ({ emit: () => {} }), fetchSockets: async () => []
    };
    __instances.push(this);
  }
  listen() { const cb = [...arguments].pop(); if (typeof cb === 'function') setImmediate(cb); return this; }
  close(cb) { if (cb) cb(); return this; }
  on() {} emit() {} to() { return { emit: () => {} }; } of() { return this.sockets; } attach() { return this; }
  addSocket(id) { const s = new FakeSocket(id); this.sockets._map.set(id, s); return s; }
}
module.exports = { Server, FakeSocket, __instances };
`;

const mongoStub = `const __calls = [];
class MongoClient {
  constructor() {
    this._col = {
      findOne: async (q) => { __calls.push(['findOne', JSON.stringify(q)]); return null; },
      insertOne: async (d) => { __calls.push(['insertOne', JSON.stringify(d)]); return { acknowledged: true }; },
      updateOne: async (f, u) => { __calls.push(['updateOne', JSON.stringify(f), JSON.stringify(u)]); return { acknowledged: true, modifiedCount: 1 }; }
    };
  }
  async connect() { return this; }
  async close() { return true; }
  db() { return { collection: () => this._col }; }
}
module.exports = { MongoClient, __calls };
`;

const files = { express: expressStub, 'socket.io': socketIoStub, mongodb: mongoStub };

for (const [name, body] of Object.entries(files)) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify({ name, version: '0.0.0-harness-stub', main: 'index.js' }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'index.js'), body);
  console.log('stub ->', path.relative(path.join(__dirname, '..'), path.join(dir, 'index.js')));
}
console.log('\nStubs ready. Delete node_modules/{express,socket.io,mongodb} when done.');
