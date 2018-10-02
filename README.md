node-mtp-reference-stratum
==========================

This is a reference [MTP](https://zcoin.io/what-is-mtp-merkle-tree-proof-and-why-it-is-important-to-zcoin/)
 Stratum pool to aid in programmer development
of Zcoin MTP (Merkle Tree Proof) miners and pools that use the
MTP Stratum Protocol. It is not intended to be used in production as is.

This stratum has been developed and tested on [Node v8.12](https://nodejs.org/) and [Ubuntu 16.04](http://releases.ubuntu.com/16.04/)

## Usage ##
The MTP Stratum can be used as a module in a pool:
```js
const StratumPool = require('mtp-reference-stratum').StratumPool;

const pool = new StratumPool({
    config: config,
    authorizeFn: authorizeFn
});

pool.on(StratumPool.EVENT_SHARE_SUBMITTED, function (e) {
    console.log(e);
});

pool.start();
```
### Configuration ###
```js
const config = {
    address: 'TBVKqLhVBt4aCwM5aPvUin5YU4ATHWUNpC', // pool wallet address
    daemon: {
        host: '127.0.0.1', // daemon ip/hostname
        rpcPort: 17101,    // rpc port
        user: 'rpcuser',   // rpc user name
        password: 'x'      // rpc password
    },
    port: {
        number: 3000,      // port number
        diff: 1            // difficulty
    }
}
```
### AuthorizeFn ###
The authorize function is used to accept or deny worker authorizations.
```js
function authorizeFn(worker, callback) {
    /* The "worker" argument is an instance of class.StratumWorker.js */
    if (worker.ipAddress === 'badguy') {
        callback({
            isAuthorized: false,
            error: [20, 'No bad guys allowed', null] // optional
        });
    }
    else {
        callback({
            isAuthorized: true
        });
    }
}
```
### Start Script ###
There is a start script (`start.js`) included which contains further
examples. It can also be run in order to get a Stratum going for test
purposes. You will need to open and modify the config inside before
running it.
```
> node start
```

## Areas of Interest ##
- `lib/class.ShareProcessor.js` - Processes shares, validates proofs, etc.
- `lib/class.Job.js` - Contains header and block serialization.
- `lib/class.StratumClient.js` - Contains server->client Stratum communications.
- `lib/class.StratumClientHandler.js` - Contains client->server Stratum communications.

## Resources ##
- [Zcoin](https://zcoin.io/) - The first cryptocurrency to implement the Merkle Tree Proof POW algorithm.
- [What is MTP](https://zcoin.io/what-is-mtp-merkle-tree-proof-and-why-it-is-important-to-zcoin/)

## License ##
Some components have been adapted from [node-stratum-pool](https://github.com/zone117x/node-stratum-pool). The same [GPL License](LICENSE) is in use.
