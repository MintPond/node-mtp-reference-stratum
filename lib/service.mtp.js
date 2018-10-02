"use strict";

const mtp = require('hasher-mtp');

module.exports = {
    VERSION: 1,
    MTP_L: 64,
    POW_LIMIT: 0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff,
    verify: mtp.verify
};