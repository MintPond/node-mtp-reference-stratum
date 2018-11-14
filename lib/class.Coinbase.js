"use strict";

const
    base58 = require('base58-native'),
    ExtraNonceCounter = require('./class.ExtraNonceCounter'),
    OpCodes = require('./const.OpCodes'),
    buffers = require('./service.buffers');

const
    BUFFER_U32_ZERO = buffers.packUInt32LE(0),
    BUFFER_VAR_ONE = buffers.packVarInt(1),
    BUFFER_32_MAX = Buffer.from('FFFFFFFF', 'hex'),
    BUFFER_POOL_SIGNATURE = buffers.serializeString('/MintPond MTP Ref/'),
    BUFFER_TX_VERSION_1 = buffers.packUInt32LE(1),
    BUFFER_INPUT_HASH = buffers.packUInt256LE(0);

module.exports = Coinbase;

/**
 * @constructor
 * Represents a coinbase transaction for a Job and provides means to serialize for construction of block hex.
 *
 * @param args               {object}  Argument object.
 * @param args.poolAddress   {string}  The wallet address of the pool where block rewards are received.
 * @param args.blockTemplate {object}  The block template object parsed from JSON wallet RPC "getblocktemplate" method.
 * @param args.isTestnet     {boolean} True if running on a testnet wallet, otherwise false. Ensures correct founders
 *                                       reward addresses are used.
 */
function Coinbase(args) {

    const poolAddress = args.poolAddress;
    const blockTemplate = args.blockTemplate;
    const isTestnet = args.isTestnet;

    const extraNonceSize = ExtraNonceCounter.EXTRANONCE_PLACEHOLDER.length;
    const coinbase1Buf = _createCoinbase1();
    const coinbase2Buf = _createCoinbase2();

    Object.defineProperties(this, {

        /**
         * The first part of the coinbase data.
         * @type {Buffer}
         */
        coinbase1Buf: { value: coinbase1Buf },

        /**
         * The second part of the coinbase data.
         * @type {Buffer}
         */
        coinbase2Buf: { value: coinbase2Buf }
    });


    /**
     * Serialize coinbase using the specified extranonce values.
     *
     * @param extraNonce1Buf {Buffer}  The extranonce1 Buffer to insert.
     * @param extraNonce2Buf {Buffer}  The extranonce2 Buffer to insert.
     *
     * @returns {Buffer} Coinbase Buffer
     */
    this.serialize = serialize;


    function serialize(extraNonce1Buf, extraNonce2Buf) {
        return Buffer.concat([
            coinbase1Buf,
            extraNonce1Buf,
            extraNonce2Buf,
            coinbase2Buf
        ]);
    }

    function _createCoinbase1() {

        const inputScript = Buffer.concat([
            /* block height      */ buffers.serializeNumber(blockTemplate.height),
            /* flags             */ Buffer.from(blockTemplate.coinbaseaux.flags, 'hex'),
            /* time              */ buffers.serializeNumber(Date.now() / 1000 | 0),
            /* extranonce length */ Buffer.from([extraNonceSize])
        ]);
        const inputScriptLen = inputScript.length + extraNonceSize + BUFFER_POOL_SIGNATURE.length;
        if (inputScriptLen > 100)
            throw new Error('Coinbase input script is too large');

        return Buffer.concat([
            /* version       */ BUFFER_TX_VERSION_1,

            // Tx Inputs
            /* input count   */ BUFFER_VAR_ONE,
            /* input tx hash */ BUFFER_INPUT_HASH,
            /* input vout    */ BUFFER_32_MAX,
            /* input scr len */ buffers.packVarInt(inputScriptLen),
            /* input scr     */ inputScript
            // ...
        ]);
    }

    function _createCoinbase2() {

        const outputTransactions = _createTxOutputs();

        return Buffer.concat([

            // ...
            /* input pool sig */ BUFFER_POOL_SIGNATURE,
            /* input sequence */ BUFFER_32_MAX,

            // Tx Outputs
            /* output count   */ buffers.packVarInt(outputTransactions.txCount),
            /* outputs        */ outputTransactions.txBuffer,

            /* lock time      */ BUFFER_U32_ZERO
        ]);
    }

    function _createTxOutputs() {

        const txOutputBuffers = [];
        const minerRewardSt = blockTemplate.coinbasevalue;
        var txCount = 0;

        // Znodes
        if (blockTemplate.znode) {
            const znode = blockTemplate.znode;

            if (znode.payee) {
                _addTransaction(znode.amount, buffers.addressToScript(znode.payee));
            }
        }

        // Founders rewards
        const founder1RewardSt = 100000000 / 2;
        const founder2RewardSt = 100000000 / 2;
        const founder3RewardSt = 100000000 / 2;
        const founder4RewardSt = 300000000 / 2;
        const founder5RewardSt = 100000000 / 2;

        const founder1Script = _addressToScript(
            isTestnet ? 'TDk19wPKYq91i18qmY6U9FeTdTxwPeSveo' : 'aCAgTPgtYcA4EysU4UKC86EQd5cTtHtCcr');

        const founder2Script = _addressToScript(
            isTestnet ? 'TWZZcDGkNixTAMtRBqzZkkMHbq1G6vUTk5' : 'aHu897ivzmeFuLNB6956X6gyGeVNHUBRgD');

        const founder3Script = _addressToScript(
            isTestnet ? 'TRZTFdNCKCKbLMQV8cZDkQN9Vwuuq4gDzT' : 'aQ18FBVFtnueucZKeVg4srhmzbpAeb1KoN');

        const founder4Script = _addressToScript(
            isTestnet ? 'TG2ruj59E5b1u9G3F7HQVs6pCcVDBxrQve' : 'a1HwTdCmQV3NspP2QqCGpehoFpi8NY4Zg3');

        const founder5Script = _addressToScript(
            isTestnet ? 'TCsTzQZKVn4fao8jDmB9zQBk9YQNEZ3XfS' : 'a1kCCGddf5pMXSipLVD9hBG2MGGVNaJ15U');

        _addTransaction(founder1RewardSt, founder1Script);
        _addTransaction(founder2RewardSt, founder2Script);
        _addTransaction(founder3RewardSt, founder3Script);
        _addTransaction(founder4RewardSt, founder4Script);
        _addTransaction(founder5RewardSt, founder5Script);

        // Payment to pool
        if (poolAddress) {
            const poolAddressScript = _addressToScript(poolAddress);
            _addTransaction(minerRewardSt, poolAddressScript, true);
        }

        if (blockTemplate.default_witness_commitment !== undefined) {
            const witness_commitment = Buffer.from(blockTemplate.default_witness_commitment, 'hex');
            _addTransaction(0, witness_commitment, true);
        }

        return {
            txCount: txCount,
            txBuffer: Buffer.concat(txOutputBuffers)
        };

        function _addTransaction(rewardSt, scriptBuffer, toFront) {

            txOutputBuffers[toFront ? 'unshift' : 'push'](
                buffers.packInt64LE(rewardSt),
                buffers.packVarInt(scriptBuffer.length),
                scriptBuffer
            );

            txCount++;
        }
    }
}

function _addressToScript(addr) {

    const decoded = base58.decode(addr);
    if (!decoded) {
        throw new Error('base58 decode failed for ' + addr);
    }

    const pubkey = decoded.slice(1, -4);
    const script = Buffer.alloc(pubkey.length + 5);
    script[0] = OpCodes.OP_DUP;
    script[1] = OpCodes.OP_HASH160;
    script[2] = OpCodes.PUSH_20;
    pubkey.copy(script, 3);
    script[script.length - 2] = OpCodes.OP_EQUALVERIFY;
    script[script.length - 1] = OpCodes.OP_CHECKSIG;

    return script;
}