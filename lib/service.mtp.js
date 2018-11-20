"use strict";

const mtp = require('hasher-mtp');

module.exports = {
    VERSION: 0x1000,
    MTP_L: 64,
    POW_LIMIT: 0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff,
    verify: mtp.verify
};