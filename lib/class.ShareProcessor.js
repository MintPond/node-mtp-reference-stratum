"use strict";

const
    ExtraNonceCounter = require('./class.ExtraNonceCounter'),
    bignum = require('./service.bignum'),
    buffers = require('./service.buffers'),
    mtp = require('./service.mtp');

const
    ERR_MALFORMED_JOB_ID = [20, 'Malformed job id', null],
    ERR_MALFORMED_TIME = [20, 'Malformed time', null],
    ERR_MALFORMED_NONCE = [20, 'Malformed nonce', null],
    ERR_MALFORMED_EXTRA_NONCE_2 = [20, 'Malformed extranonce2', null],
    ERR_MALFORMED_MTP_HASH_ROOT = [20, 'Malformed MTP hash root', null],
    ERR_MALFORMED_MTP_BLOCK = [20, 'Malformed MTP block', null],
    ERR_MALFORMED_MTP_PROOF = [20, 'Malformed MTP proof', null],
    ERR_INCORRECT_MTP_HASH_ROOT_SIZE = [20, 'Incorrect size of MTP hash root', null],
    ERR_INCORRECT_MTP_BLOCK_SIZE = [20, 'Incorrect size of MTP block size', null],
    ERR_INCORRECT_EXTRANONCE2_SIZE = [20, 'Incorrect size of extranonce2', null],
    ERR_INCORRECT_SIZE_TIME = [20, 'Incorrect size of ntime', null],
    ERR_TIME_OUT_OF_RANGE = [20, 'ntime out of range', null],
    ERR_INCORRECT_SIZE_NONCE = [20, 'Incorrect size of nonce', null],
    ERR_STALE_SHARE = [21, 'Stale share - Job not found', null],
    ERR_DUPLICATE_SHARE = [22, 'Duplicate share', null],
    ERR_MTP_VERIFY_FAILED = [20, 'MTP verify failed', null],
    ERR_LOW_DIFFICULTY = [23, 'Low difficulty', null];

const MTP_L = 64;
const MTP_HASH_ROOT_SIZE = 16;
const MTP_BLOCK_SIZE = 8 * MTP_L * 2 * 128;

module.exports = ShareProcessor;

/**
 * @constructor
 * Processes shares by determining if they are valid.
 *
 * @param args       {object}      Argument object.
 * @param args.pool  {StratumPool} The StratumPool instance the share processor is for.
 */
function ShareProcessor(args) {

    const pool = args.pool;

    this.submit = submit;

    /**
     * Submit a share for processing.
     *
     * @param args                {object}         Argument object.
     * @param args.stratumClient  {StratumClient}  The StratumClient that submitted the share.
     * @param args.worker         {StratumWorker}  The StratumWorker that submitted the share.
     * @oaram args.jobIdBuf       {Buffer}         The 4-byte Job ID buffer
     * @param args.timeBuf        {Buffer}         The nTime buffer
     * @param args.nonceBuf       {Buffer}         The nonce buffer
     * @param args.extraNonce1Buf {Buffer}         The extraNonce1 buffer
     * @param args.extraNonce2Buf {Buffer}         The extraNonce2 buffer
     * @param args.mtpHashRootBuf {Buffer}         The MTP hashRoot proof buffer
     * @param args.mtpBlockBuf    {Buffer}         The MTP block proof buffer
     * @param args.mtpProofBuf    {Buffer}         The MTP proof proof buffer
     *
     * @returns {{
     *     error: {null|Array},
     *     result: {boolean} True if share accepted, false if rejected,
     *     shareData: {object}
     * }}
     */
    function submit(args) {

        const client = args.stratumClient;
        const worker = args.worker;
        const jobIdBuf = args.jobIdBuf;
        const timeBuf = args.timeBuf;
        const nonces = {
            nonceBuf: args.nonceBuf,
            extraNonce1Buf: client.extraNonce1Buf,
            extraNonce2Buf: args.extraNonce2Buf
        };
        const mtpProofs = {
            hashRootBuf: args.mtpHashRootBuf,
            blockBuf: args.mtpBlockBuf,
            proofBuf: args.mtpProofBuf
        };

        const submitTime = Date.now() / 1000 | 0;
        const mtpHashValueBuf = Buffer.alloc(32); // is filled during _tryInvalidate function call
        var stratumDiff = client.difficulty;
        var job = null; // is set during _tryInvalidate function call
        var shareDiff = 0; // declare here so that it is available in errors

        /* attempt to find reason to invalidate share */
        const errorInfo = _tryInvalidate();
        if (errorInfo)
            return errorInfo;

        const headerBn = bignum.fromBuffer(mtpHashValueBuf, { endian: 'little', size: 32 });
        shareDiff = mtp.POW_LIMIT / headerBn.toNumber();

        const isBlockCandidate = job.targetBn.ge(headerBn);
        if (isBlockCandidate) {

            const hashHeader = job.serializeHashHeader(
                nonces.nonceBuf,
                nonces.extraNonce1Buf,
                nonces.extraNonce2Buf,
                timeBuf,
                mtpHashValueBuf);

            const blockHex = job.serializeBlock(
                hashHeader.buffer,
                mtpProofs,
                hashHeader.coinbaseBuf).toString('hex');

            const blockHash = _hashBlock(hashHeader.buffer);



            return _shareData(null, blockHex, blockHash);
        }

        const diffFactor = shareDiff / stratumDiff;
        if (diffFactor < 0.99) {

            const prevStratumDiff = client.previousDifficulty;

            if (prevStratumDiff && shareDiff >= prevStratumDiff) {
                stratumDiff = prevStratumDiff;
            }
            else {
                return _shareData(ERR_LOW_DIFFICULTY);
            }
        }
        return _shareData();


        function _tryInvalidate() {

            /* check job id type */
            if (!Buffer.isBuffer(jobIdBuf))
                return _shareData(ERR_MALFORMED_JOB_ID);

            /* check time type */
            if (!Buffer.isBuffer(timeBuf))
                return _shareData(ERR_MALFORMED_TIME);

            /* check nonce type */
            if (!Buffer.isBuffer(nonces.nonceBuf))
                return _shareData(ERR_MALFORMED_NONCE);

            /* check extranonce2 type */
            if (!Buffer.isBuffer(nonces.extraNonce2Buf))
                return _shareData(ERR_MALFORMED_EXTRA_NONCE_2);

            /* check mtp hash root type */
            if (!Buffer.isBuffer(mtpProofs.hashRootBuf))
                return _shareData(ERR_MALFORMED_MTP_HASH_ROOT);

            /* check mtp block type */
            if (!Buffer.isBuffer(mtpProofs.blockBuf))
                return _shareData(ERR_MALFORMED_MTP_BLOCK);

            /* check mtp proof type */
            if (!Buffer.isBuffer(mtpProofs.proofBuf))
                return _shareData(ERR_MALFORMED_MTP_PROOF);

            /* check nonce size */
            if (nonces.nonceBuf.length !== 4)
                return _shareData(ERR_INCORRECT_SIZE_NONCE);

            /* check ExtraNonce2 size */
            if (nonces.extraNonce2Buf.length !== ExtraNonceCounter.EXTRANONCE_2_SIZE)
                return _shareData(ERR_INCORRECT_EXTRANONCE2_SIZE);

            /* check time size */
            if (timeBuf.length !== 4)
                return _shareData(ERR_INCORRECT_SIZE_TIME);

            /* check MTP hash root size */
            if (mtpProofs.hashRootBuf.length !== MTP_HASH_ROOT_SIZE)
                return _shareData(ERR_INCORRECT_MTP_HASH_ROOT_SIZE);

            /* check MTP block size */
            if (mtpProofs.blockBuf.length !== MTP_BLOCK_SIZE)
                return _shareData(ERR_INCORRECT_MTP_BLOCK_SIZE);

            /* check job */
            const jobIdHex = buffers.leToHex(jobIdBuf);
            job = pool.jobManager.validJobs[jobIdHex];
            if (!job)
                return _shareData(ERR_STALE_SHARE);

            /* check time range */
            const timeInt = timeBuf.readUInt32LE(0);
            if (timeInt < job.blockTemplate.curtime || timeInt > submitTime + 7200)
                return _shareData(ERR_TIME_OUT_OF_RANGE);

            /* check for duplicate shares */
            if (!job.registerSubmit(nonces.nonceBuf, nonces.extraNonce1Buf, nonces.extraNonce2Buf, timeBuf))
                return _shareData(ERR_DUPLICATE_SHARE);

            /* validate MTP proofs */
            const isValidProofs = _verifyProofs(job, client, mtpProofs, nonces, timeBuf, mtpHashValueBuf);
            if (!isValidProofs)
                return _shareData(ERR_MTP_VERIFY_FAILED);

            return false;
        }

        function _shareData(error, blockHex, blockHash) {

            const shareData = {
                error: error,

                job: job,
                worker: worker,
                client: client,

                blockHex: blockHex,
                blockHash: blockHash,
                submitTime: submitTime,
                shareDiff: parseFloat((shareDiff || 0).toFixed(8)),
                shareValue: 0,
                stratumDiff: stratumDiff || 0,

                time: buffers.leToHex(timeBuf),
                nonce: buffers.leToHex(nonces.nonceBuf),
                extraNonce1: buffers.leToHex(nonces.extraNonce1Buf),
                extraNonce2: buffers.leToHex(nonces.extraNonce2Buf),
                mtpHashValue: buffers.leToHex(mtpHashValueBuf),
                mtpHashRoot: buffers.leToHex(mtpProofs.hashRootBuf),
                mtpBlock: buffers.leToHex(mtpProofs.blockBuf),
                mtpProofs: buffers.leToHex(mtpProofs.proofBuf),
            };

            return {
                error: error || null,
                result: !error,
                shareData: shareData
            };
        }
    }

    function _hashBlock(block) {
        return buffers.leToHex(buffers.sha256d(block));
    }

    function _verifyProofs(job, client, mtpProofs, nonces, timeBuf, mtpHashValueOut) {

        const mtpInput = job.serializeMtpInput(nonces.extraNonce1Buf, nonces.extraNonce2Buf, timeBuf);

        return mtp.verify(
            /* header    */ mtpInput,
            /* nonce     */ nonces.nonceBuf,
            /* hash root */ mtpProofs.hashRootBuf,
            /* mtp block */ mtpProofs.blockBuf,
            /* mtp proof */ mtpProofs.proofBuf,
            /* hash out  */ mtpHashValueOut);
    }
}