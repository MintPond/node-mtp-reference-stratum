"use strict";

const
    bos = require('bos'),
    events = require('events'),
    BosDeserializeBuffer = bos.BosDeserializeBuffer;

StratumClientSocket.EVENT_SOCKET_FLOODED = 'socketFlooded';
StratumClientSocket.EVENT_MALFORMED_MESSAGE = 'malformedMessage';
StratumClientSocket.EVENT_MESSAGE = 'message';
StratumClientSocket.EVENT_DISCONNECT = 'disconnect';
StratumClientSocket.EVENT_SOCKET_ERROR = 'socketError';
StratumClientSocket.EVENT_SOCKET_READY = 'ready';
StratumClientSocket.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = StratumClientSocket;

const MAX_BUFFER_SIZE = 400 * 1024;

/**
 * @constructor
 * Wrapper for the client socket connection.
 *
 * @param args         Argument object
 * @param args.socket  The client socket connection.
 */
function StratumClientSocket(args) {

    const socket = args.socket;

    const _this = this;
    var bosBuffer;

    Object.defineProperties(this, {

        /**
         * The IP address the client is connecting from.
         * @type {string}
         */
        remoteAddress: { value: socket.remoteAddress, enumerable: true },

        /**
         * The IP address the client is connecting to.
         * @type {string}
         */
        localAddress: { value: socket.localAddress, enumerable: true},

        /**
         * The port number the client is connecting to.
         * @type {number}
         */
        localPort: { value: socket.localPort, enumerable: true }
    });

    /**
     * Write an object to the client socket. The object is serialized before being sent.
     *
     * @param obj {*} The object to send.
     */
    this.write = write;

    /**
     * Destroy the socket.
     */
    this.destroy = socket.destroy.bind(socket);

    _init();


    function write(obj) {
        socket.write(bos.serialize(obj));
    }

    function _init() {

        socket.on('data', _bosReader);

        socket.on('close', function () {
            _this.emit(StratumClientSocket.EVENT_DISCONNECT);
        });

        socket.on('error', function (err) {
            if (err.code !== 'ECONNRESET')
                _this.emit(StratumClientSocket.EVENT_SOCKET_ERROR, err);
        });

        setImmediate(function () {
            _this.emit(StratumClientSocket.EVENT_SOCKET_READY);
        });
    }

    function _bosReader(dataBuffer) {

        if (!bosBuffer) {
            bosBuffer = new BosDeserializeBuffer(MAX_BUFFER_SIZE);
            bosBuffer.maxLength = MAX_BUFFER_SIZE;
        }

        if (!bosBuffer.append(dataBuffer)) {
            bosBuffer.clear();
            _this.emit(StratumClientSocket.EVENT_SOCKET_FLOODED);
            return;
        }

        const messages = [];
        const totalRead = _deserialize(bosBuffer, messages);
        if (totalRead === false) {
            bosBuffer.clear();
            _this.emit(StratumClientSocket.EVENT_MALFORMED_MESSAGE, dataBuffer);
        }
        else if (totalRead === 1) {
            _this.emit(StratumClientSocket.EVENT_MESSAGE, messages[0], messages[0]);
        }
        else if (totalRead > 1) {
            messages.forEach(function (message) {
                _this.emit(StratumClientSocket.EVENT_MESSAGE, message, message);
            });
        }
    }
}

function _deserialize(bosBuffer, outputArray) {
    try {
        return bosBuffer.deserialize(outputArray);
    } catch (e) {
        return false;
    }
}