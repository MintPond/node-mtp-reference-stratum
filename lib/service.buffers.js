"use strict";

const crypto = require('crypto');

module.exports = {

    EMPTY_BUFFER: Buffer.alloc(0),
    UINT256_ZERO_BUFFER: Buffer.alloc(32, 0),

    /**
     * Hash data in supplied buffer using SHA256 and return result in new buffer.
     *
     * @param buffer {Buffer}  The buffer to hash.
     *
     * @returns {PromiseLike<Buffer>}
     */
    sha256: sha256,

    /**
     * Hash data in supplied buffer twice using SHA256 and return result in new buffer.
     *
     * @param buffer {Buffer}  The buffer to hash.
     *
     * @returns {PromiseLike<Buffer>}
     */
    sha256d: sha256d,

    /**
     * Reverse bytes in a buffer.
     *
     * @param buffer  {Buffer}  The buffer to reverse (input).
     * @param [output] {Buffer}  Optional output buffer to put results into. If omitted, the input buffer is used.
     *
     * @returns {Buffer} The reversed buffer (buffer or output)
     */
    reverseBytes: reverseBytes,

    /*
      "serialized CScript" formatting as defined here:
      https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki#specification
      Used to format height and date when putting into script signature:
      https://en.bitcoin.it/wiki/Script
    */
    serializeNumber: serializeNumber,

    /*
       Used for serializing strings used in script signature
    */
    serializeString: serializeString,

    /**
     * Convert little endian buffer to big endian hex string.
     *
     * @param buffer {Buffer} The buffer to convert
     *
     * @returns {string} Big endian hex string.
     */
    leToHex: leToHex,

    /**
     * Convert big endian hex string to little endian buffer.
     *
     * @param hex  {string}  The hex string to convert.
     *
     * @returns {Buffer} Little endian buffer.
     */
    hexToLE: hexToLE,
    /**
     * Create variable length integer buffer.
     *
     * @param number {number} The number to pack into a buffer.
     *
     * @returns {Buffer}
     */
    packVarInt: packVarInt,
    packInt32LE: packInt32LE,
    packUInt32LE: packUInt32LE,
    packInt64LE: packInt64LE,
    /**
     * Pack a number into a 32 byte buffer.
     *
     * @param number  {number|string}  The number or hexadecimal string to pack. Assumes hex is big endian.
     * @param [output] {Buffer} Optional buffer to put result into.
     *
     * @returns {Buffer}  The result.
     */
    packUInt256LE: packUInt256LE
};

function sha256(buffer) {
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest();
}

function sha256d(buffer) {
    return sha256(sha256(buffer));
}

function reverseBytes(buffer, output) {
    var byte = 0;
    output = output || buffer;
    for (var i = 0; i < buffer.length / 2; i++) {
        byte = buffer[i];
        output[i] = buffer[buffer.length - i - 1];
        output[buffer.length - i - 1] = byte;
    }
    return output;
}

function serializeNumber(n) {

    /* Old version that is bugged
     if (n < 0xfd){
     var buff = newBuffer(2);
     buff[0] = 0x1;
     buff.writeUInt8(n, 1);
     return buff;
     }
     else if (n <= 0xffff){
     var buff = newBuffer(4);
     buff[0] = 0x3;
     buff.writeUInt16LE(n, 1);
     return buff;
     }
     else if (n <= 0xffffffff){
     var buff = newBuffer(5);
     buff[0] = 0x4;
     buff.writeUInt32LE(n, 1);
     return buff;
     }
     else{
     return Buffer.concat([newBuffer([0x9]), binpack.packUInt64(n, 'little')]);
     }*/

    //New version from TheSeven
    if (n >= 1 && n <= 16)
        return Buffer.from([0x50 + n]);

    var l = 1;
    var buff = Buffer.alloc(9);

    while (n > 0x7f) {
        buff.writeUInt8(n & 0xff, l++);
        n >>= 8;
    }

    buff.writeUInt8(l, 0);
    buff.writeUInt8(n, l++);
    return buff.slice(0, l);
}

function serializeString(s) {

    if (s.length < 253) {

        return Buffer.concat([
            Buffer.from([s.length]),
            Buffer.from(s)
        ]);

    } else if (s.length < 0x10000) {

        return Buffer.concat([
            Buffer.from([253]),
            packUInt16LE(s.length),
            Buffer.from(s)
        ]);

    } else if (s.length < 0x100000000) {

        return Buffer.concat([
            Buffer.from([254]),
            packUInt32LE(s.length),
            Buffer.from(s)
        ]);

    } else {
        return Buffer.concat([
            Buffer.from([255]),
            packUInt16LE(s.length),
            Buffer.from(s)
        ]);
    }
}

function leToHex(buffer) {
    return reverseBytes(buffer, Buffer.alloc(buffer.length)).toString('hex');
}

function hexToLE(hex) {
    return reverseBytes(Buffer.from(hex, 'hex'));
}

function packVarInt(number) {

    // https://en.bitcoin.it/wiki/Protocol_specification#Variable_length_integer
    // |Value	        | Size |	Format
    // |----------------|------|
    // | < 0xFD	        | 1	   | uint8_t
    // | <= 0xFFFF	    | 3	   | 0xFD followed by the length as uint16_t
    // | <= 0xFFFF FFFF	| 5	   | 0xFE followed by the length as uint32_t
    // | -	            | 9	   | 0xFF followed by the length as uint64_t

    var buffer;

    if (number < 0xFD) {
        buffer = Buffer.alloc(1);
        buffer.writeUInt8(number, 0);

    } else if (number <= 0xFFFF) {

        buffer = Buffer.alloc(3);
        buffer.writeUInt8(0xFD, 0);
        buffer.writeUInt16LE(number, 1);

    } else if (number <= 0xFFFFFFFF) {

        buffer = Buffer.alloc(5);
        buffer.writeUInt8(0xFE, 0);
        buffer.writeUInt32LE(number, 1);

    } else {
        buffer = Buffer.alloc(9);
        buffer.writeUInt8(0xFF, 0);
        throw new Error('UInt64 not implemented');
    }

    return buffer;
}

function packUInt16LE(number) {
    const output = Buffer.alloc(2);
    output.writeUInt16LE(number, 0);
    return output;
}

function packInt32LE(number) {
    const output = Buffer.alloc(4);
    output.writeInt32LE(number, 0);
    return output;
}

function packUInt32LE(number) {
    const output = Buffer.alloc(4);
    output.writeUInt32LE(number, 0);
    return output;
}

function packInt64LE(number) {
    const output = Buffer.alloc(8);
    output.writeUInt32LE(number % Math.pow(2, 32), 0);
    output.writeUInt32LE(Math.floor(number / Math.pow(2, 32)), 4);
    return output;
}

function packUInt256LE(number, output) {

    if (typeof number === 'number')
        number = _toFixedHex(number, 32);

    const buffer = reverseBytes(Buffer.from(number, 'hex'));

    if (buffer.length !== 32) {
        const resized = output || Buffer.alloc(32, 0);
        buffer.copy(resized, 0);
        return resized;
    }

    output && buffer.copy(output);
    return output || buffer;
}

function _toFixedHex(number, size) {

    const hex = number.toString(16);
    const zeroPadLen = size * 2 - hex.length;
    return zeroPadLen <= 0 ? hex : '0'.repeat(zeroPadLen) + hex;
}