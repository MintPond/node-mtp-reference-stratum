"use strict";

const bignum = require('bignum');

module.exports = {
    from: bignum,
    fromBuffer: bignum.fromBuffer,
    /**
     * Create bignum instance from Target Bits buffer.
     *
     * @param bitsBuff  {Buffer}  The Bits to convert.
     *
     * @returns {bignum}
     */
    fromBits: fromBits,
    /**
     * Create bignum instance from Target Bits hexadecimal.
     *
     * @param bitsHex  {string}  The Bits to convert.
     *
     * @returns {bignum}
     */
    fromBitsHex: fromBitsHex
};

function fromBits(bitsBuff) {

    const numBytes = bitsBuff.readUInt8(0);
    const bitsBn = bignum.fromBuffer(bitsBuff.slice(1));

    const bn2 = bignum(2);
    const bn8 = bignum(8);

    return bitsBn.mul(bn2.pow(bn8.mul(numBytes - 3)));
}

function fromBitsHex(bitsHex) {
    const buffer = Buffer.from(bitsHex, 'hex');
    return fromBits(buffer);
}
