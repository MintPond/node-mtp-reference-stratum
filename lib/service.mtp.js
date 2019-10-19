"use strict";

const mtp = require('hasher-mtp');

module.exports = {
    VERSION: 0x1000,
    MTP_L: 64,
    DIFF1: 0x00000000ffff0000000000000000000000000000000000000000000000000000,
    POOL_MULTIPLIER: Math.pow(2, 16),
    verify: mtp.verify
};