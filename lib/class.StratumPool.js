"use strict";

const
    async = require('async'),
    events = require('events');

StratumPool.EVENT_LOG = 'log';
StratumPool.EVENT_STARTED = 'started';
StratumPool.EVENT_CLIENT_CONNECTED = 'clientConnected';
StratumPool.EVENT_CLIENT_DISCONNECTED = 'clientDisconnected';
StratumPool.EVENT_SHARE_SUBMITTED = 'shareSubmit';
StratumPool.EVENT_NEW_BLOCK = 'newBlock';
StratumPool.EVENT_BROADCAST_JOBS = 'broadcastJobs';
StratumPool.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = StratumPool;

const
    BlockPoller = require('./class.BlockPoller'),
    ShareProcessor = require('./class.ShareProcessor'),
    StratumServer = require('./class.StratumServer'),
    JobManager = require('./class.JobManager'),
    Daemon = require('./class.Daemon');

/**
 * @constructor
 * Stratum pool
 *
 * @param args
 * @param args.authorizeFn  {function} Function to authorize client during "mining.authorize" method.
 * @param args.config       {object}   Pool configuration object.
 *
 * @param args.config.address             {string}  The pools wallet address for block rewards to be payed to.
 *
 * @param args.config.daemon              {object}  Configuration object passed to Daemon class constructor.
 * @param args.config.daemon.host         {string}  Coin daemon RPC host address.
 * @param args.config.daemon.rpcPort      {number}  The coin daemon RPC port.
 * @param args.config.daemon.user         {string}  The coin daemon RPC username.
 * @param args.config.daemon.password     {string}  The coin daemon RPC password.
 *
 * @param args.config.port                {object}  Object containing port information.
 * @param args.config.port.number         {number}  The port number.
 * @param args.config.port.diff           {number}  The pool scale difficulty.
 *
 * @param [args.config.coinbaseSignature] {string}  Signature to include in coinbase.
 */
function StratumPool(args) {

    const authorizeFn = args.authorizeFn;
    const config = args.config;
    const coinbaseSignature = args.coinbaseSignature;

    const _this = this;
    var blockPollingIntervalHandle;
    var server;
    var jobManager;
    var isStarted = false;
    var isTestnet = false;

    const shareProcessor = new ShareProcessor({
        pool: _this
    });

    const daemon = new Daemon({
        config: config.daemon
    });

    const blockPoller = new BlockPoller({
        pool: _this
    });

    Object.defineProperties(this, {

        /**
         * Determine if the pool has been started.
         * @type {boolean}
         */
        isStarted: {
            get: function () { return isStarted; }
        },

        /**
         * Get the StratumServer instance.
         * @type {StratumServer}
         */
        server: {
            get: function () { return server; }
        },

        /**
         * Get the JobManager instance.
         * @type {JobManager}
         */
        jobManager: {
            get: function() { return jobManager; }
        },

        /**
         * Get the ShareProcessor instance.
         * @type {ShareProcessor}
         */
        shareProcessor: {
            get: function() { return shareProcessor; }
        },

        /**
         * Get the RPC daemon handler.
         * @type {Daemon}
         */
        daemon: {
            get: function() { return daemon; }
        },

        /**
         * Determine if the pool is on testnet.
         * @type {boolean}
         */
        isTestnet: {
            get: function() { return isTestnet; }
        },

        /**
         * Get the signature to include in the coinbase.
         * @type {string}
         */
        coinbaseSignature: {
            get: function () { return coinbaseSignature || '/MintPond MTP Ref/'; }
        },

        /**
         * Get the pool configuration.
         * @type {object}
         */
        config: {
            get: function() { return config; }
        }
    });

    /**
     * Start the pool.
     */
    this.start = start;

    /**
     * Stop the pool.
     *
     * @param [callback] {function} Optional callback without arguments.
     */
    this.stop = stop;

    /**
     * Update the current job. Retrieves block template from daemon RPC and broadcasts new jobs to miners.
     */
    this.updateJob = updateJob;

    /**
     * Checks the RPC daemon for a new block and if found, broadcasts a new block job to the miners.
     */
    this.updateBlockTemplate = updateBlockTemplate;

    /**
     * Broadcast latest mining job to miners.
     *
     * @param args             {object}  Argument object.
     * @param args.job         {Job}     The Job instance to broadcast to miners.
     * @param args.isNewBlock  {boolean} True if this job is for a new block, false if it updates the current one.
     */
    this.broadcastMiningJobs = broadcastMiningJobs;

    /**
     * Submit share data to the pool.
     *
     * @param args             {object} Argument object.
     * @param args.shareData   {object} Share data. See ShareProcessor to see layout of shareData.
     * @param [args.blockHex]  {string} If the share is for a valid block, include the block hex to be submitted to
     *                                    the RPC wallet.
     * @param [args.blockHash] {string} If the share is for a valid block, include the block hash.
     */
    this.submitShare = submitShare;


    function start() {

        if (isStarted)
            throw new Error('Stratum is already started');

        async.waterfall([
            _startDaemon,
            _startGetCoinInfo,
            _startJobManager,
            _startFirstJob,
            _startStratumServer
        ], function completeCallback(err) {
            if (err) {
                console.error(err);
            }
            else {
                console.log('Stratum started');
                _this.emit(StratumPool.EVENT_STARTED);
                isStarted = true;
                blockPoller.reset();
            }
        });
    }

    function stop(callback) {

        if (!isStarted)
            throw new Error('Stratum isn\'t started');

        clearInterval(blockPollingIntervalHandle);

        if (server) {
            server.stop(callback);
        }
        else {
            callback && callback();
        }
    }

    function updateJob() {
        _getBlockTemplate(function (blockTemplate) {
            _updateBlockTemplate(blockTemplate, true/*updateJob*/);
        });
    }

    function updateBlockTemplate() {
        _getBlockTemplate(function (blockTemplate) {

            if (jobManager.currentJob && jobManager.currentJob.blockTemplate.previousblockhash === blockTemplate.previousblockhash)
                return;

            _updateBlockTemplate(blockTemplate);
        });
    }

    function broadcastMiningJobs(args) {

        if (!server)
            return;

        _this.emit(StratumPool.EVENT_BROADCAST_JOBS);

        if (args.isNewBlock) {
            _this.emit(StratumPool.EVENT_NEW_BLOCK);
            server.broadcastMiningJobs(args);
        }
        else {
            server.broadcastMiningJobs(args);
        }
    }

    function submitShare(args) {

        const shareData = args.shareData;
        const blockHex = shareData.blockHex;
        const blockHash = shareData.blockHash;

        const isValidShare = !shareData.error;
        var isValidBlock = !!blockHex;

        if (isValidBlock) {

            async.waterfall([

                /* submit block */
                function submitBlock(waterfallCallback) {
                    daemon.cmd({
                        method: 'submitblock',
                        params: [blockHex],
                        callback: function cmdCallback(err, errorMessage) {

                            if (err) {
                                console.error('Error while submitting block', errorMessage);
                                waterfallCallback(err);
                                return;
                            }
                            else if (errorMessage) {
                                console.error('Daemon rejected a supposedly valid block', errorMessage);
                            }

                            console.log('Submitted Block successfully to daemon');

                            waterfallCallback(errorMessage);
                        }
                    });
                },

                /* check block accepted */
                function checkBlockAccepted(waterfallCallback) {
                    daemon.cmd({
                        method: 'getblock',
                        params: [blockHash],
                        callback: function (err, result) {

                            if (err) {
                                console.error('Failed to verify block submission: ' + blockHash);
                                waterfallCallback(err, false);
                            }
                            else {
                                waterfallCallback(null, true, result.tx[0]/*txHash*/, result.height);
                            }
                        }
                    });
                }

            ], function completeCallback(err, isAccepted, txHash) {

                isValidBlock = isAccepted;
                shareData.txHash = txHash;
                shareData.blockAcceptError = err;

                _this.emit(StratumPool.EVENT_SHARE_SUBMITTED, {
                    isValidShare: isValidShare,
                    isValidBlock: isValidBlock,
                    shareData: shareData
                });
                _getBlockTemplate(function (blockTemplate) {
                    _updateBlockTemplate(blockTemplate, false/*updateJob*/);
                });
            });
        }
        else {
            _this.emit(StratumPool.EVENT_SHARE_SUBMITTED, {
                isValidShare: isValidShare,
                isValidBlock: isValidBlock,
                shareData: shareData
            });
        }
    }


    function _startDaemon(waterfallCallback) {

        if (typeof config.daemon !== 'object') {
            console.error('Daemon not configured.');
            return;
        }

        daemon.cmd({
            method: 'getinfo',
            params: [],
            callback: function (err) {
                if (err) {
                    waterfallCallback('Daemon not ready.');
                    console.error(err);
                }
                else {
                    waterfallCallback();
                }
            }
        });
    }

    function _startGetCoinInfo(waterfallCallback) {

        var results = {
            validateAddress: null
        };

        async.waterfall([

            /* validate pool address */
            function validateAddress(waterfallCallback) {
                daemon.validateAddress({
                    address: config.address,
                    callback: function validateAddressCallback(isValid, result) {
                        results.validateAddress = result;
                        waterfallCallback(!isValid ? 'Invalid coinbase address' : null);
                    }
                });
            },

            /* get daemon info */
            function getInfo(waterfallCallback) {
                daemon.cmd({
                    method: 'getinfo',
                    callback: function getInfoCallback(err, info) {
                        results.getInfo = info;
                        waterfallCallback(err);
                    }
                });
            }

        ], function completeCallback(err) {

            if (err) {
                waterfallCallback(err);
                return;
            }

            isTestnet = results.getInfo.testnet;

            waterfallCallback();
        });
    }

    function _startJobManager(waterfallCallback) {
        jobManager = new JobManager({
            pool: _this
        });
        waterfallCallback();
    }

    function _startFirstJob(waterfallCallback) {
        _getBlockTemplate(function (blockTemplate) {
            _updateBlockTemplate(blockTemplate, false/*updateJob*/);
        });
        waterfallCallback();
    }

    function _startStratumServer(waterfallCallback) {

        server = new StratumServer({
            pool: _this,
            authorizeFn: authorizeFn
        });

        // Client connected
        server.on(StratumServer.EVENT_CLIENT_CONNECTED, function (e) {
            _this.emit(StratumPool.EVENT_CLIENT_CONNECTED, e);
        });

        // Client disconnected
        server.on(StratumServer.EVENT_CLIENT_DISCONNECTED, function (e) {
            _this.emit(StratumPool.EVENT_CLIENT_DISCONNECTED, e);
        });

        // Started
        server.on(StratumServer.EVENT_STARTED, function () {
            waterfallCallback();
        });
    }

    function _getBlockTemplate(callback) {
        daemon.cmd({
            method: 'getblocktemplate',
            callback: function (err, blockTemplate) {
                if (err) {
                    console.log(err);
                }
                else {
                    callback && callback(blockTemplate);
                }
            }
        });
    }

    function _updateBlockTemplate(blockTemplate, updateJob) {

        const isNewBlock = blockTemplate && jobManager.processTemplate(blockTemplate);

        if (isNewBlock) {
            broadcastMiningJobs({
                job: jobManager.currentJob,
                isNewBlock: true
            });
        }
        else if (updateJob && jobManager.currentJob) {
            broadcastMiningJobs({
                job: jobManager.currentJob,
                isNewBlock: false,
            });
        }
    }
}
