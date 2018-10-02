"use strict";

const bignum = require('./service.bignum');

ExtraNonceCounter.EXTRANONCE_PLACEHOLDER = Buffer.from('f00000000000000ff11111111111111f', 'hex');
ExtraNonceCounter.EXTRANONCE_SIZE = 8;
ExtraNonceCounter.EXTRANONCE_2_SIZE = ExtraNonceCounter.EXTRANONCE_PLACEHOLDER.length - ExtraNonceCounter.EXTRANONCE_SIZE;

module.exports = ExtraNonceCounter;

/**
 * @constructor
 * Distributes ExtraNonce1 values.
 */
function ExtraNonceCounter() {

    var counterBn = bignum.from(0);

    /**
     * Get the next ExtraNonce1 value.
     *
     * @returns {Buffer}
     */
    this.next = next;


    function next() {

        if (counterBn.ge(0xFFFFFFFFFFFFFFFF)) {
            counterBn = bignum.from(0);
        }
        counterBn = counterBn.add(1);

        return counterBn.toBuffer({ endian: 'little', size: 8 });
    }
}