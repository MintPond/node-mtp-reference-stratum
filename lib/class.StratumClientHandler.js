"use strict";

const events = require('events');

StratumClientHandler.EVENT_UNKNOWN_STRATUM_METHOD = 'unknownStratumMethod';
StratumClientHandler.EVENT_SUBSCRIBE = 'subscribe';
StratumClientHandler.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = StratumClientHandler;

const
    StratumWorker = require('./class.StratumWorker'),
    buffers = require('./service.buffers');

const ERR_UNAUTHORIZED_WORKER = [24, 'Unauthorized worker', null];

/**
 * @constructor
 * Handles messages received from the client.
 *
 * @param args             {object}              Argument object.
 * @param args.pool        {StratumPool}         The StratumPool instance the client is connected to.
 * @param args.client      {StratumClient}       The handlers parent StratumClient instance.
 * @param args.vars        {object}              StratumClient internal variables.
 * @param args.authorizeFn {function}            Function to authorize client during "mining.authorize" method.
 * @param args.socket      {StratumClientSocket} Socket connection.
 * @param args.portConfig  {object}              The config of the port the client connected to.
 *
 * @param args.portConfig.number         {number} The port number
 * @param args.portConfig.diff           {number} The difficulty.
 */
function StratumClientHandler(args) {

    const pool = args.pool;
    const client = args.client;
    const vars = args.vars;
    const authorizeFn = args.authorizeFn;
    const socket = args.socket;
    const portConfig = args.portConfig;

    /**
     * Handle a message sent from the client.
     *
     * @param message {object} Deserialized message.
     *
     * @returns {boolean} True if the message contained a valid method and was handled, otherwise false.
     */
    this.handleMessage = handleMessage;


    function handleMessage(message) {

        if (vars.isSubscribed) {

            switch (message.method) {

                case 'mining.authorize':
                    _handleAuthorize(message);
                    return true;

                case 'mining.submit':
                    _handleSubmit(message);
                    return true;

                default:
                    return false;
            }

        }
        else {

            switch (message.method) {

                case 'mining.subscribe':
                    return _handleSubscribe(message);

                default:
                    return false;
            }
        }
    }

    function _handleSubscribe(message) {

        const userAgentIndex = 0;

        vars.userAgent = message.params ? message.params[userAgentIndex] || vars.userAgent : vars.userAgent;
        vars.isSubscribed = true;
        vars.label = null;

        socket.write({
            id: message.id,
            result: [
                buffers.hexToLE(client.subscriptionId),
                client.extraNonce1Buf
            ],
            error: null
        });
    }

    function _handleAuthorize(message) {

        vars.workerName = message.params[0];
        const password = message.params[1] || '';

        const worker = new StratumWorker({
            name: vars.workerName,
            password: password,
            ipAddress: client.remoteAddress,
            port: portConfig.number,
            userAgent: vars.userAgent,
            client: client
        });

        vars.minerAddress = worker.minerAddress;

        authorizeFn(worker, function authorizeCallback(result) {

            vars.isAuthorized = (!result.error && result.isAuthorized);

            socket.write({
                id: message.id,
                result: vars.isAuthorized,
                error: !vars.isAuthorized ? [24, result.error, null] : null
            });

            if (vars.isAuthorized) {

                const job = pool.jobManager.currentJob;

                client.workerMap.set(vars.workerName, worker);
                client.sendDifficulty(pool.config.port.diff || 1);
                client.sendMiningJob({
                    job: job,
                    isNewBlock: true // it's a new block as far as miner is concerned
                });
            }
            else {
                worker.markRemoved();
                client.disconnect('Unauthorized');
            }
        });
    }

    function _handleSubmit(message) {

        vars.lastActivityMs = Date.now();

        if (!vars.isAuthorized) {

            socket.write({
                id: message.id,
                result: null,
                error: ERR_UNAUTHORIZED_WORKER
            });
            return;
        }

        const workerName = message.params[0];
        const worker = client.workerMap.get(workerName);

        if (!worker) {

            socket.write({
                id: message.id,
                result: null,
                error: ERR_UNAUTHORIZED_WORKER
            });
            return;
        }

        const jobIdBuf = message.params[1];
        const extraNonce2Buf = message.params[2];
        const timeBuf = message.params[3];
        const nonceBuf = message.params[4];
        const mtpHashRootBuf = message.params[5];
        const mtpBlockBuf = message.params[6];
        const mtpProofBuf = message.params[7];

        const result = pool.shareProcessor.submit({
            stratumClient: client,
            worker: worker,
            jobIdBuf: jobIdBuf,
            nonceBuf: nonceBuf,
            extraNonce2Buf: extraNonce2Buf,
            timeBuf: timeBuf,
            mtpHashRootBuf: mtpHashRootBuf,
            mtpBlockBuf: mtpBlockBuf,
            mtpProofBuf: mtpProofBuf
        });

        pool.submitShare(result);

        socket.write({
            id: message.id,
            result: !result.error,
            error: result.error || null
        });
    }
}

