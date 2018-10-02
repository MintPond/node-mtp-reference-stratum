"use strict";

const events = require('events');

StratumClient.EVENT_UNKNOWN_STRATUM_METHOD = 'unknownStratumMethod';
StratumClient.EVENT_MALFORMED_MESSAGE = 'malformedMessage';
StratumClient.EVENT_SOCKET_DISCONNECT = 'socketDisconnect';
StratumClient.EVENT_SOCKET_ERROR = 'socketError';
StratumClient.EVENT_SOCKET_TIMEOUT = 'socketTimeout';
StratumClient.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = StratumClient;

const
    StratumClientHandler = require('./class.StratumClientHandler'),
    StratumClientSocket = require('./class.StratumClientSocket'),
    buffers = require('./service.buffers'),
    mtp = require('./service.mtp');

/**
 * @constructor
 * Represents a client connection to the stratum.
 *
 * @param args
 * @param args.subscriptionIdHex {string}              Unique connection ID hex.
 * @param args.pool              {StratumPool}         The pool instance the client connected to.
 * @param args.authorizeFn       {function}            Function to authorize client during "mining.authorize" method.
 * @param args.extraNonce1Buf    {Buffer}              The ExtraNonce1 assigned to the client.
 * @param args.socket            {StratumClientSocket} Socket connection.
 * @param args.server            {StratumServer}
 * @param args.portConfig        {object}              The config of the port the client connected to.
 *
 * @param args.portConfig.number         {number} The port number
 * @param args.portConfig.diff           {number} The starting difficulty.
 */
function StratumClient(args) {

    const pool = args.pool;
    const authorizeFn = args.authorizeFn;
    const extraNonce1Buf = args.extraNonce1Buf;
    const socket = args.socket;
    const subscriptionIdHex = args.subscriptionIdHex;
    const portConfig = args.portConfig;

    var pendingDifficulty = null;

    const _this = this;
    const workerMap = new Map();
    const connectTimeMs = Date.now();
    const vars = {
        lastActivityMs: Date.now(),
        isAuthorized: false,
        isSubscribed: false,
        minerAddress: null,
        previousDifficulty: 0,
        difficulty: 0,
        workerName: '',
        userAgent: 'unknown',
        currentJob: null,
        disconnectReason: '',
        label: ''
    };
    const handler = new StratumClientHandler({
        pool: pool,
        client: _this,
        vars: vars,
        portConfig: portConfig,
        authorizeFn: authorizeFn,
        socket: socket
    });

    Object.defineProperties(this, {

        /**
         * Get the unique ID of the client connection as a hexadecimal value.
         * @type {string}
         */
        subscriptionId: {
            get: function () { return subscriptionIdHex; },
            enumerable: true
        },

        /**
         * The wallet address of the client.
         * @type {string}
         */
        minerAddress: {
            get: function () { return vars.minerAddress; },
            enumerable: true
        },

        /**
         * The IP address of the client.
         * @type {string}
         */
        remoteAddress: {
            get: function () { return socket.remoteAddress; },
            enumerable: true
        },

        /**
         * Determine if the client has submitted a 'mining.subscribe' request.
         * @type {boolean}
         */
        isSubscribed: {
            get: function () { return vars.isSubscribed; },
            enumerable: true
        },

        /**
         * Determine if the client has successfully submitted a 'mining.authorize' request.
         * @type {boolean}
         */
        isAuthorized: {
            get: function () { return vars.isAuthorized; },
            enumerable: true
        },

        /**
         * Get the server port which the client is connected to.
         * @type {number}
         */
        localPort: {
            get: function () { return socket.localPort; },
            enumerable: true
        },

        /**
         * Get the Unix timestamp of the last activity by the client (in milliseconds).
         * @type {number}
         */
        lastActivityMs: {
            get: function () { return vars.lastActivityMs; },
            enumerable: true
        },

        /**
         * Get the Unix timestamp connection time of the client (in milliseconds).
         * @type {number}
         */
        connectTimeMs: {
            get: function () { return connectTimeMs; },
            enumerable: true
        },

        /**
         * Get the clients assigned ExtraNonce1 buffer.
         * @type {Buffer}
         */
        extraNonce1Buf: {
            value: extraNonce1Buf,
            enumerable: true
        },

        /**
         * Get the clients current stratum difficulty.
         * @type {number}
         */
        difficulty: {
            get: function () { return vars.difficulty; },
            enumerable: true
        },

        /**
         * Get a Map containing all workers by name. Used by StratumClientHandler.
         * @type {Map}
         */
        workerMap: {
            get: function () { return workerMap; }
        },

        /**
         * Get worker name. If there is more than 1 then the most recent worker name is used.
         * @type {string}
         */
        workerName: {
            get: function () { return vars.workerName || 'worker'; },
            enumerable: true
        },

        /**
         * Get the reason the client disconnected. Value is not valid until the client has disconnected.
         * @type {string}
         */
        disconnectReason: {
            get: function () { return vars.disconnectReason; }
        },
    });

    /**
     * Initialize the client.
     */
    this.init = init;

    /**
     * Send a mining job to the client.
     *
     * @param args             {object}  Argument object.
     * @param args.job         {Job}     The Job instance to send.
     * @param args.isNewBlock  {boolean} True if this job is for a new block, false if it updates the current one.
     */
    this.sendMiningJob = sendMiningJob;

    /**
     * Send difficulty to the client. (sends as target)
     *
     * @param diff {number}  The difficulty value.
     *
     * @returns {boolean}  True if sent, otherwise false.
     */
    this.sendDifficulty = sendDifficulty;

    /**
     * Enqueue the next difficulty to be sent the next time a job is sent to the client.
     *
     * @param newDifficulty {number} The new difficulty
     */
    this.enqueueNextDifficulty = enqueueNextDifficulty;

    /**
     * Disconnects the client from the server.
     *
     * @param reason {string} A reason the client was disconnected.
     */
    this.disconnect = disconnect;


    function init() {

        socket.on(StratumClientSocket.EVENT_MESSAGE, function (message) {
            if (!handler.handleMessage(message)) {
                _this.emit(StratumClient.EVENT_UNKNOWN_STRATUM_METHOD, message);
            }
        });

        socket.on(StratumClientSocket.EVENT_SOCKET_FLOODED, function () {
            disconnect('Socket flooded');
        });

        socket.on(StratumClientSocket.EVENT_MALFORMED_MESSAGE, function (message) {

            _this.emit(StratumClient.EVENT_MALFORMED_MESSAGE, JSON.stringify({
                message: message,
                minerAddress: vars.minerAddress,
                ip: socket.remoteAddress
            }));
            disconnect('Malformed message');
        });

        socket.on(StratumClientSocket.EVENT_DISCONNECT, function () {
            vars.disconnectReason = vars.disconnectReason || 'Client Disconnect';
            _this.emit(StratumClient.EVENT_SOCKET_DISCONNECT, vars.disconnectReason);
        });

        socket.on(StratumClientSocket.EVENT_SOCKET_ERROR, function (err) {
            if (err.code !== 'ECONNRESET')
                _this.emit(StratumClient.EVENT_SOCKET_ERROR, err);
        });
    }


    function sendMiningJob(args) {

        const job = args.job;
        const isNewBlock = args.isNewBlock;

        vars.currentJob = job;

        const elapsedTimeMs = Date.now() - vars.lastActivityMs;
        const isTimedOut = elapsedTimeMs > (portConfig.connectionTimeout || 600) * 1000;

        if (isTimedOut) {
            _this.emit(StratumClient.EVENT_SOCKET_TIMEOUT,
                'Timed out. Last activity was over ' + (elapsedTimeMs / 1000 | 0) + ' seconds ago.');
            disconnect('Timeout');
            return;
        }

        if (pendingDifficulty) {
            sendDifficulty(pendingDifficulty);
            pendingDifficulty = 0;
        }

        socket.write({
            id: null,
            method: 'mining.notify',
            params: [
                /* 0 Job Id        */ buffers.hexToLE(job.id),
                /* 1 prevhash      */ buffers.hexToLE(job.prevHashHex),
                /* 2 coinb1        */ job.coinbase.coinbase1Buf,
                /* 3 coinb2        */ job.coinbase.coinbase2Buf,
                /* 4 merkle_branch */ job.merkleTree.steps,
                /* 5 version       */ buffers.packInt32LE(job.blockTemplate.version),
                /* 6 nbits (diff)  */ buffers.hexToLE(job.blockTemplate.bits),
                /* 7 ntime         */ buffers.packUInt32LE(job.blockTemplate.curtime),
                /* 8 clean_jobs    */ isNewBlock
            ]
        });
    }

    function sendDifficulty(diff) {

        if (diff === vars.difficulty || diff <= 0 || !pool.jobManager.currentJob)
            return false;

        vars.previousDifficulty = vars.difficulty;
        vars.difficulty = Math.min(diff, pool.jobManager.currentJob.difficultyAdj);

        const targetBuf = buffers.packUInt256LE(mtp.POW_LIMIT / vars.difficulty);

        socket.write({
            id: null,
            method: "mining.set_target",
            params: [targetBuf]
        });

        return true;
    }

    function enqueueNextDifficulty(newDifficulty) {
        pendingDifficulty = newDifficulty;
    }

    function disconnect(reason) {
        vars.disconnectReason = reason;
        socket.destroy();
    }
}