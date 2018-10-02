"use strict";

const
    Job = require('./class.Job'),
    JobBroadcastTimer = require('./class.JobBroadcastTimer'),
    JobCounter = require('./class.JobCounter');

module.exports = JobManager;

/**
 * @constructor
 * Manages Job instances.
 *
 * @param args       {object}      Argument object.
 * @param args.pool  {StratumPool} The StratumPool instance the JobManager is for.
 */
function JobManager(args) {

    const pool = args.pool;

    const jobCounter = new JobCounter();
    const jobBroadcastTimer = new JobBroadcastTimer({
        onTimeout: pool.updateJob
    });

    var currentJob;
    var validJobsObjMap = {};

    Object.defineProperties(this, {

        currentJob: {
            get: function () { return currentJob; }
        },

        validJobs: {
            get: function () { return validJobsObjMap; }
        }
    });


    /**
     * Process a new block template.
     *
     * @param blockTemplate {object} The block template object parsed from JSON wallet RPC "getblocktemplate" method.
     *
     * @returns {boolean} True if the blockTemplate is for a new block and false if it updates the current block.
     */
    this.processTemplate = processTemplate;

    /**
     * Reset or start the job broadcast timer.
     */
    this.resetBroadcast = jobBroadcastTimer.reset;

    /**
     * Stop the job broadcast timer.
     */
    this.stopBroadcast = jobBroadcastTimer.stop;


    function processTemplate(blockTemplate) {

        var isNew = !currentJob;

        if  (currentJob && currentJob.blockTemplate.previousblockhash !== blockTemplate.previousblockhash) {

            if (blockTemplate.height < currentJob.blockTemplate.height)
                return false;

            isNew = true;
        }

        _updateJob(blockTemplate, isNew);
        return isNew;
    }

    function _updateJob(blockTemplate, isNew) {

        const blockJob = new Job({
            pool: pool,
            idHex: jobCounter.next(),
            blockTemplate: blockTemplate
        });

        currentJob = blockJob;
        isNew && (validJobsObjMap = {});
        validJobsObjMap[blockJob.id] = blockJob;
    }
}
