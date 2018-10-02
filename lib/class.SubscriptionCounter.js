"use strict";

const buffers = require('./service.buffers');

module.exports = SubscriptionCounter;

/**
 * @constructor
 * Distributes connection subscription ID's
 */
function SubscriptionCounter() {

    var count = 0;
    const padding = 'deadbeefcafebabe';

    /**
     * Get the next subscription Id hexadecimal.
     * @returns {string}
     */
    this.next = next;


    function next() {
        count++;
        if (count >= 0xFFFFFFF)
            count = 0;

        return padding + buffers.packInt64LE(count).toString('hex');
    }
}
