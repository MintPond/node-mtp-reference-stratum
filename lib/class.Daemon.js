"use strict";

const http = require('http');

const ADDRESS_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

module.exports = Daemon;

/**
 * @constructor
 * Simple class to connect to wallet daemon RPC to issue commands.
 *
 * @param args                 {object} Argument object.
 * @param args.config          {object} Object containing daemon configuration
 * @param args.config.host     {string} IP/hostname where daemon RPC is located.
 * @param args.config.rpcPort  {number} Port number where the daemon RPC can be connected to.
 * @param args.config.user     {string} The daemon RPC username for authorization.
 * @param args.config.password {string} The daemon RPC password for authorization.
 */
function Daemon(args) {

    const config = args.config;

    /**
     * Send an RPC command to the wallet daemon.
     *
     * @param args
     * @param args.method     {string}   The RPC method name.
     * @param [args.params]   {Array}    Array containing method parameter arguments.
     * @param [args.callback(err, rpcResult)] {function} Function to callback when RPC response is received.
     */
    this.cmd = cmd;

    /**
     * Validate a wallet address.
     *
     * @param args            {object} Arguments object.
     * @param args.address    {string} Wallet address to validate.
     * @param [args.callback(isValid, rpcResult)] {function} Callback to receive result
     */
    this.validateAddress = validateAddress;


    function cmd(args) {

        const method = args.method;
        const params = args.params || [];
        const request = {
            method: method,
            params: params,
            id: Date.now() + Math.floor(Math.random() * 10),
            stack: args.stack || new Error().stack
        };

        _sendRequest(request, args.callback);
    }

    function validateAddress(args) {

        const address = args.address;
        const callback = args.callback;

        // validate characters
        for (var i=0; i < address.length; i++) {
            if (ADDRESS_CHARS.indexOf(address[i]) === -1) {
                callback && callback(false);
                return;
            }
        }

        cmd({
            method: 'validateaddress',
            params: [address],
            callback: function (err, results) {
                if (err) {
                    console.error(err);
                }
                var isValid = !err && results.isvalid;
                callback && callback(isValid, results);
            }
        });
    }

    function _sendRequest(request, callback) {

        const serializedRequest = JSON.stringify(request);
        const options = {
            hostname: (typeof config.host === 'undefined' ? '127.0.0.1' : config.host),
            port: config.rpcPort,
            method: 'POST',
            auth: config.user + ':' + config.password,
            headers: {
                'Content-Length': serializedRequest.length
            }
        };

        const req = http.request(options, function (res) {

            var data = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function () {
                _parseResponse({
                    res: res,
                    data: data,
                    callback: callback
                });
                callback = null;
            });
        });

        req.on('error', function (e) {
            callback && callback(e, null);
            callback = null;
        });

        req.end(serializedRequest);
    }

    function _parseResponse(args) {

        const res = args.res;
        const data = args.data;
        const callback = args.callback;

        if (res.statusCode === 401) {
            console.error('Daemon rejected username and/or password.');
            return;
        }

        const parsedData = _tryParseJson(res, data);

        if (parsedData.result) {
            callback && callback(parsedData.result.error, parsedData.result.result, data, config);
        }
        else {
            console.error('Failed to parse rpc data response from daemon: ' + parsedData.error);
        }
    }
}

function _tryParseJson(res, data) {

    var result = null;

    try {
        result = {
            error: null,
            result: JSON.parse(data)
        };
    } catch (e) {

        if (data.indexOf(':-nan') !== -1) {
            data = data.replace(/:-nan,/g, ':0');
            result = _tryParseJson(res, data);
        }
        else {
            result = { error: e };
        }
    }

    return result;
}