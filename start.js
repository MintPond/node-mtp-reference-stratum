const StratumPool = require('./lib/class.StratumPool');

const pool = new StratumPool({
    config: {
        address: 'TBVKqLhVBt4aCwM5aPvUin5YU4ATHWUNpC',
        daemon: {
            host: '127.0.0.1',
            rpcPort: 18888,
            user: 'rpcuser',
            password: 'x'
        },
        port: {
            number: 3000,
            diff: 1
        }
    },
    authorizeFn: authorizeFn
});

pool.on(StratumPool.EVENT_CLIENT_CONNECTED, function (e) {
    console.log('Client connected: ' + e.client.remoteAddress);
});

pool.on(StratumPool.EVENT_CLIENT_DISCONNECTED, function (e) {
    console.log('Client disconected: ' + e.client.remoteAddress + ', reason: ' + e.reason);
});

pool.on(StratumPool.EVENT_SHARE_SUBMITTED, function (e) {
    const shareData = e.shareData;
    console.log('Share received: ' + JSON.stringify({
        worker: shareData.worker.name,
        isValidShare: e.isValidShare,
        isValidBlock: e.isValidBlock,
        error: shareData.error ? [shareData.errorCode, shareData.error] : null,
        jobId: shareData.job ? shareData.job.id : null/* stale share */,
        nTime: shareData.time,
        nonce: shareData.nonce,
        extraNonce1: shareData.extraNonce1,
        extraNonce2: shareData.extraNonce2,
        mtpHashValue: shareData.mtpHashValue,

    }, null, 4));
});

pool.on(StratumPool.EVENT_NEW_BLOCK, function () {
    console.log('NEW BLOCK');
});

pool.start();

function authorizeFn(worker, callback) {
    callback({
        isAuthorized: true,
        error: null
    });
}