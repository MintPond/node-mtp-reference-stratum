"use strict";

const
    Coinbase = require('./class.Coinbase'),
    MerkleTree = require('./class.MerkleTree'),
    bignum = require('./service.bignum'),
    buffers = require('./service.buffers.js'),
    mtp = require('./service.mtp');

module.exports = Job;

/**
 * @constructor
 * Represents a potential block to be mined (job) that is given to miners.
 *
 * @param args               {object}      Argument object.
 * @param args.idHex         {string}      The job ID represented as a hex value.
 * @param args.blockTemplate {object}      The block template object parsed from JSON wallet RPC "getblocktemplate"
 *                                           method.
 * @param args.pool          {StratumPool} The StratumPool instance to job is for.
 */
function Job(args) {

    const idHex = args.idHex;
    const blockTemplate = args.blockTemplate;
    const pool = args.pool;

    const submissionObjMap = {};

    const versionBuf = buffers.packUInt32LE(blockTemplate.version);
    const prevHashBuf = buffers.hexToLE(blockTemplate.previousblockhash);
    const bitsBuf = buffers.hexToLE(blockTemplate.bits);

    const targetBn = blockTemplate.target
        ? bignum.from(blockTemplate.target, 16)
        : bignum.fromBitsHex(blockTemplate.bits);

    const nDifficulty = parseFloat((mtp.DIFF1 / targetBn.toNumber()).toFixed(9));
    const difficultyAdj = parseFloat((mtp.DIFF1 / targetBn.toNumber() * mtp.POOL_MULTIPLIER).toFixed(9));

    const transactionDataBuf = Buffer.concat(blockTemplate.transactions.map(function mapTxHandler(tx) {
        return Buffer.from(tx.data, 'hex');
    }));

    const coinbase = new Coinbase({
        poolAddress: pool.config.address,
        blockTemplate: blockTemplate,
        isTestnet: pool.isTestnet,
        signature: pool.coinbaseSignature
    });

    const merkleTree = new MerkleTree(_getTransactionBuffers(blockTemplate.transactions));

    Object.defineProperties(this, {

        /**
         * 4-byte hexadecimal job ID.
         * @type {string}
         */
        id: { value: idHex, enumerable: true },

        /**
         * 32-byte hexadecimal previous block hash.
         * @type {string}
         */
        prevHashHex: { value: buffers.leToHex(prevHashBuf) },

        /**
         * The Coinbase instance for this job.
         * @type {Coinbase}
         */
        coinbase: { value: coinbase },

        /**
         * Block template object retrieved from the RPC wallet.
         * @type {object}
         */
        blockTemplate: { value: blockTemplate },

        /**
         * The height of the block the Job is looking for.
         * @type {number}
         */
        height: { value: blockTemplate.height, enumerable: true },

        /**
         * The network difficulty of the Job.
         * @type {number}
         */
        difficulty: { value: nDifficulty, enumerable: true },

        /**
         * The pool scale difficulty of the Job.
         * @type {number}
         */
        difficultyAdj: { value: difficultyAdj, enumerable: true },

        /**
         * The network target of the Job.
         * @type {bignum}
         */
        targetBn: { value: targetBn, enumerable: true },

        /**
         * The MerkleTree instance used for generating the transactions merkle proof.
         * @type {MerkleTree}
         */
        merkleTree: { value: merkleTree }
    });

    /**
     * Serialize header used for making the block hash. Also returns the coinbase.
     *
     * @param nonceBuf        {Buffer}  The block nonce value.
     * @param extraNonce1Buf  {Buffer}  The coinbase ExtraNonce1 value.
     * @param extraNonce2Buf  {Buffer}  The coinbase ExtraNonce2 value.
     * @param timeBuf         {Buffer}  The block nTime value.
     * @param mtpHashValueBuf {Buffer}  The MTP hash value.
     *
     * @returns {{
     *    buffer: {Buffer} Header buffer,
     *    coinbaseBuf: {Buffer} Coinbase buffer
     * }}
     */
    this.serializeHashHeader = serializeHashHeader;

    /**
     * Serialize the input data used for MTP validation.
     *
     * @param extraNonce1Buf {Buffer}  The ExtraNonce1 buffer.
     * @param extraNonce2Buf {Buffer}  The ExtraNonce2 buffer.
     * @param timeBuf        {Buffer}  The nTime buffer.
     *
     * @returns {Buffer}
     */
    this.serializeMtpInput = serializeMtpInput;

    /**
     * Serialize block for submission to wallet.
     *
     * @param hashHeaderBuf    {Buffer} The hashable block header.
     * @param mtpHashValueBuf  {Buffer} The MTP hash value.
     * @param mtpProofs        {object}
     * @param mtpProofs.hashRootBuf {Buffer} The MTP hash root data.
     * @param mtpProofs.blockBuf    {Buffer} The MTP block data.
     * @param mtpProofs.proofBuf    {Buffer} The MTP proof data.
     * @param coinbaseBuf      {Buffer} The coinbase data.
     *
     * @returns {Buffer}
     */
    this.serializeBlock = serializeBlock;

    /**
     * Register a share submission and determine check for duplicates.
     *
     * @param nonceBuf       {Buffer} The submitted nonce value.
     * @param extraNonce1Buf {Buffer} The client ExtraNonce1 value.
     * @param extraNonce2Buf {Buffer} The submitted ExtraNonce2 value.
     * @param timeBuf        {Buffer} The nTime value.
     *
     * @returns {boolean} True if the submission is new and valid, false if the submission is a duplicate.
     */
    this.registerSubmit = registerSubmit;


    function serializeHashHeader(nonceBuf, extraNonce1Buf, extraNonce2Buf, timeBuf, mtpHashValueBuf) {

        const coinbaseBuf = coinbase.serialize(extraNonce1Buf, extraNonce2Buf);
        const coinbaseHashBuffer = buffers.sha256d(coinbaseBuf);
        const merkleRootBuf = merkleTree.withFirst(coinbaseHashBuffer);

        const headerBuf = Buffer.alloc(180, 0);
        var position = 0;

        /* version    */
        versionBuf.copy(headerBuf, position);
        position += 4;

        /* prev block */
        prevHashBuf.copy(headerBuf, position);
        position += 32;

        /* merkle     */
        merkleRootBuf.copy(headerBuf, position);
        position += 32;

        /* time       */
        timeBuf.copy(headerBuf, position);
        position += 4;

        /* bits       */
        bitsBuf.copy(headerBuf, position);
        position += 4;

        /* nonce      */
        nonceBuf.copy(headerBuf, position);
        position += 4;

        /* MTP version */
        headerBuf.writeUInt32BE(mtp.VERSION, position);
        position += 4;

        /* MTP hash value */
        mtpHashValueBuf.copy(headerBuf, position);
        /* +4 bytes */

        /* +32 bytes - MTP reserved[0] */
        /* +32 bytes - MTP reserved[1] */

        return {
            buffer: headerBuf,
            coinbaseBuf: coinbaseBuf
        };
    }

    function serializeMtpInput(extraNonce1Buf, extraNonce2Buf, timeBuf) {

        const coinbaseBuf = coinbase.serialize(extraNonce1Buf, extraNonce2Buf);
        const coinbaseHashBuf = buffers.sha256d(coinbaseBuf);
        const merkleRootBuf = merkleTree.withFirst(coinbaseHashBuf);

        const headerBuf = Buffer.alloc(80);
        var position = 0;

        /* version     */
        versionBuf.copy(headerBuf, position);
        position += 4;

        /* prev block  */
        prevHashBuf.copy(headerBuf, position);
        position += 32;

        /* merkle      */
        merkleRootBuf.copy(headerBuf, position);
        position += 32;

        /* time        */
        timeBuf.copy(headerBuf, position);
        position += 4;

        /* bits        */
        bitsBuf.copy(headerBuf, position);
        position += 4;

        /* mtp version */
        headerBuf.writeUInt32BE(mtp.VERSION, position);

        return headerBuf;
    }

    function serializeBlock(hashHeaderBuf, mtpProofs, coinbaseBuf) {
        return Buffer.concat([
            /* hash header       */ hashHeaderBuf,
            /* mtp has root      */ mtpProofs.hashRootBuf,
            /* mtp block         */ mtpProofs.blockBuf,
            /* mtp proof         */ mtpProofs.proofBuf,
            /* transaction count */ buffers.packVarInt(blockTemplate.transactions.length + 1/* +coinbase */),
            /* coinbase tx       */ coinbaseBuf,
            /* transactions      */ transactionDataBuf
        ]);
    }

    function registerSubmit(nonceBuf, extraNonce1Buf, extraNonce2Buf, timeBuf) {

        const submission =
            nonceBuf.toString('hex') + ':' +
            extraNonce1Buf.toString('hex') + ':' +
            extraNonce2Buf.toString('hex') + ':' +
            timeBuf.toString('hex');

        if (submission in submissionObjMap)
            return false;

        submissionObjMap[submission] = true;

        return true;
    }

    function _getTransactionBuffers(transactions){
        const result = Array(transactions.length + 1);
        result[0] = null;
        transactions.forEach(function mapTxHandler(tx, i) {
            result[i + 1] = typeof tx.txid !== 'undefined'
                ? buffers.packUInt256LE(tx.txid)
                : buffers.packUInt256LE(tx.hash);
        });
        return result;
    }
}
