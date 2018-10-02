"use strict";

module.exports = BlockPoller;

/**
 * @constructor
 * Polls for updated blocks from daemon by calling {StratumPool#updateBlockTemplate} at interval
 *
 * @param args       {object}      Argument object.
 * @param args.pool  {StratumPool} The StratumPool instance to poll blocks for.
 */
function BlockPoller(args) {

    const pool = args.pool;

    var pollTimeoutHandle;

    /**
     * Reset or start the poller.
     */
    this.reset = reset;

    /**
     * Stop polling
     */
    this.stop = stop;


    function reset() {
        _nextPoll();
    }

    function stop() {
        clearTimeout(pollTimeoutHandle);
    }

    function _nextPoll() {

        clearTimeout(pollTimeoutHandle);
        pollTimeoutHandle = setTimeout(_poll, 1000);
    }

    function _poll() {
        _nextPoll();
        pool.updateBlockTemplate();
    }
}