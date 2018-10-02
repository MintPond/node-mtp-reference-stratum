"use strict";

module.exports = JobCounter;

/**
 * @constructor
 * Distributes Job ID's.
 */
function JobCounter() {

    var counter = 0;
    const BUFFER = Buffer.alloc(4);

    this.next = next;

    function next() {

        counter++;

        if (counter % 0xFFFFFFFF === 0)
            counter = 1;

        BUFFER.writeUInt32BE(counter);
        return BUFFER.toString('hex');
    }
}