"use strict";

const
    events = require('events'),
    net = require('net');

StratumServer.EVENT_STARTED = 'started';
StratumServer.EVENT_CLIENT_CONNECTED = 'clientConnected';
StratumServer.EVENT_CLIENT_DISCONNECTED = 'clientDisconnected';
StratumServer.EVENT_BROADCAST_TIMEOUT = 'broadcastTimeout';
StratumServer.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = StratumServer;

const
    ExtraNonceCounter = require('./class.ExtraNonceCounter'),
    StratumClient = require('./class.StratumClient'),
    StratumClientSocket = require('./class.StratumClientSocket'),
    SubscriptionCounter = require('./class.SubscriptionCounter');

/**
 * @constructor
 * Stratum client server.
 *
 * @param args             {object}      Argument object.
 * @param args.pool        {StratumPool} The StratumPool instance the server is for.
 * @param args.authorizeFn {function}    Function to authorize client during "mining.authorize" method.
 */
function StratumServer(args) {

    const pool = args.pool;
    const authorizeFn = args.authorizeFn;

    const poolConfig = pool.config;
    const portConfig = poolConfig.port;

    const _this = this;
    const clientMap = new Map();
    const subscriptionCounter = new SubscriptionCounter();
    const extraNonceCounter = new ExtraNonceCounter();
    var isStopped = false;
    var server;

    Object.defineProperties(this, {

        /**
         * Get the {ExtraNonceCounter}.
         * @type {ExtraNonceCounter}
         */
        extraNonceCounter: { value: extraNonceCounter },

        /**
         * Get map containing connected {StratumClient} instances.
         * @type {Map}
         */
        clientMap: { value: clientMap }
    });


    /**
     * Broadcast latest mining job to miners.
     *
     * @param args             {object}  Argument object.
     * @param args.job         {Job}     The Job instance to broadcast to miners.
     * @param args.isNewBlock  {boolean} True if this job is for a new block, false if it updates the current one.
     */
    this.broadcastMiningJobs = broadcastMiningJobs;

    /**
     * Stop the server.
     *
     * @param [callback] {function} Optional callback without argument.
     */
    this.stop = stop;


    _init();

    function broadcastMiningJobs(args) {

        const job = args.job;
        const isNewBlock = args.isNewBlock;

        for (const client of clientMap.values()) {
            client.sendMiningJob({
                job: job,
                isNewBlock: isNewBlock
            });
        }

        pool.jobManager.resetBroadcast();
    }

    function stop(callback) {

        if (isStopped) {
            callback && callback();
            return;
        }

        isStopped = true;
        pool.jobManager.stopBroadcast();

        server.close(function serverCloseCallback() {
            callback && callback();
        });

        clientMap.forEach(function eachClientHandler(client, subscriptionId) {
            client.disconnect('Server stopping');
            clientMap.delete(subscriptionId);
        });
    }

    function _handleNewClient(portConfig, socket) {

        if (isStopped || !socket.remoteAddress) {
            socket.destroy();
            return;
        }

        socket.setKeepAlive(true);

        const subscriptionIdHex = subscriptionCounter.next();
        const client = new StratumClient(
            {
                pool: pool,
                authorizeFn: authorizeFn,
                extraNonce1Buf: extraNonceCounter.next(),
                socket: new StratumClientSocket({
                    socket: socket,
                    portConfig: portConfig
                }),
                subscriptionIdHex: subscriptionIdHex,
                portConfig: portConfig
            }
        );

        clientMap.set(subscriptionIdHex, client);

        _this.emit(StratumServer.EVENT_CLIENT_CONNECTED, { client: client });

        // Socket Disconnect
        client.on(StratumClient.EVENT_SOCKET_DISCONNECT, function disconnectHandler(reason) {

            _removeStratumClientBySubId(subscriptionIdHex);
            _this.emit(StratumServer.EVENT_CLIENT_DISCONNECTED, {
                client: client,
                reason: reason
            });
        });

        client.init();
    }

    function _removeStratumClientBySubId(subscriptionId) {

        const client = clientMap.get(subscriptionId);

        if (client) {

            client.workerMap.forEach(function eachWorkerHandler(worker) {
                worker.markRemoved();
            });

            clientMap.delete(subscriptionId);
        }
    }

    function _init() {

        pool.jobManager.resetBroadcast();

        const portNumber = parseInt(portConfig.number);
        const server = net.createServer({ allowHalfOpen: false }, function (socket) {
            _handleNewClient(portConfig, socket);
        });

        server.listen({
            port: portNumber,
            exclusive: false
        }, function serverListeningCallback() {
            _this.emit(StratumServer.EVENT_STARTED);
        });
    }
}
