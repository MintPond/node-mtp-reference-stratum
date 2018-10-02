"use strict";

module.exports = StratumWorker;

/**
 * @constructor
 * Stratum client authorized worker.
 *
 * @param args           {object} Argument Object
 * @param args.name      {string} The full worker name (wallet address and worker name: WALLET_ADDRESS.workerName)
 * @param args.password  {string} The password the worker used to authorize.
 * @param args.ipAddress {string} The remote IP address of the worker.
 * @param args.port      {number} The port number the worker connected to.
 * @param args.userAgent {string} The user agent name specified by the worker.
 * @param args.client    {StratumClient} The client the worker is from.
 */
function StratumWorker(args) {

    const name = args.name;
    const password = args.password;
    const ipAddress = args.ipAddress;
    const port = args.port;
    const userAgent = args.userAgent || 'unknown';
    const client = args.client;

    const minerAddress = name.split('.')[0];
    const shortName = name.split('.')[1] || 'worker';
    var isRemoved = false;

    Object.defineProperties(this, {

        /**
         * Get the full name of the worker. This includes the wallet address and the worker name.
         * @type {string}
         */
        name: {
            value: name,
            enumerable: true
        },

        /**
         * Get the short name of the worker. This excludes the wallet address.
         * @type {string}
         */
        shortName: {
            value: shortName,
            enumerable: true
        },

        /**
         * Get the password the worker used to connect.
         * @type {string}
         */
        password: {
            value: password
        },

        /**
         * Get the wallet address of the worker.
         * @type {string}
         */
        minerAddress: {
            value: minerAddress,
            enumerable: true
        },

        /**
         * Get the remote IP address of the worker.
         * @type {string}
         */
        ipAddress: {
            value: ipAddress,
            enumerable: true
        },

        /**
         * Get the local port address the worker connected to.
         * @type {number}
         */
        port: {
            value: port,
            enumerable: true
        },

        /**
         * Get the user agent specified by the client.
         * @type {string}
         */
        userAgent: {
            value: userAgent,
            enumerable: true
        },

        /**
         * Determine if the worker instance is for a client that is no longer connected.
         * @type {boolean}
         */
        isRemoved: {
            get: function () { return isRemoved; },
            enumerable: true
        },

        /**
         * Get the workers parent client instance.
         * @type {StratumClient}
         */
        client: { value: client }
    });

    /**
     * Marks the worker as removed from the server.
     */
    this.markRemoved = markRemoved;

    function markRemoved() {
        isRemoved = true;
    }
}