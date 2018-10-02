"use strict";

module.exports = JobBroadcastTimer;

/**
 * @constructor
 * Handles timing of Job broadcasts to miners.
 *
 * @param args           {object}   Argument object.
 * @param args.onTimeout {function} A function to call when it is time to broadcast jobs.
 */
function JobBroadcastTimer(args) {

    const onTimeout = args.onTimeout;

    var rebroadcastTimeoutHandle;

    /**
     * Reset or start the broadcast timer.
     */
    this.reset = reset;

    /**
     * Stop the broadcast timer.
     */
    this.stop = stop;


    function reset() {
        _nextBroadcast();
    }

    function stop() {
        clearTimeout(rebroadcastTimeoutHandle);
    }

    function _nextBroadcast() {

        clearTimeout(rebroadcastTimeoutHandle);
        rebroadcastTimeoutHandle = setTimeout(_broadcast, 55 * 1000);
    }

    function _broadcast() {
        _nextBroadcast();
        onTimeout();
    }
}