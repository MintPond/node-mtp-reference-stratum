"use strict";

const buffers= require('./service.buffers.js');

/*
 Original javascript code from https://github.com/zone117x/node-stratum-pool/blob/master/lib/merkleTree.js
 Ported from https://github.com/slush0/stratum-mining/blob/master/lib/merkletree.py
 */
module.exports = MerkleTree;

function MerkleTree(data) {

    this.data = data;
    this.steps = _calculateSteps(data);
    this.root = _calculateRoot(data[0] == null ? data.slice(1) : data);

    // Used to calculate the steps for adding a coinbase later
    function _calculateSteps(data) {

        var L = data;
        const steps = [];
        const PreL = [null];
        const StartL = 2;
        var Ll = L.length;

        if (Ll > 1) {
            while (true) {

                if (Ll === 1)
                    break;

                steps.push(L[1]);

                if (Ll % 2)
                    L.push(L[L.length - 1]);

                const Ld = [];
                const r = _range(StartL, Ll, 2);

                r.forEach(function eachHandler(i) {
                    Ld.push(_merkleJoin(L[i], L[i + 1]));
                });

                L = PreL.concat(Ld);
                Ll = L.length;
            }
        }
        return steps;
    }

    // Used to calculate merkle root without adding a coinbase later
    function _calculateRoot(_data) {

        const data = _data; // We dont want to work in-place

        // This is a recursive function
        if (data.length > 1) {

            if (data.length % 2 !== 0)
                data.push(data[data.length - 1]);

            // Hash
            const newData = [];

            for (var i = 0; i < data.length; i += 2) {
                newData.push(_merkleJoin(data[i], data[i + 1]));
            }

            return _calculateRoot(newData);
        }
        else {
            return data[0];
        }
    }
}

MerkleTree.prototype = {

    withFirst: function (f) {
        this.steps.forEach(function eachStepHandler(s) {
            f = buffers.sha256d(Buffer.concat([f, s]));
        });
        return f;
    },

    // Used to develop steps to prove a single hash is part of a merkle root
    getHashProof: function (h) {

        var data = this.data;
        if (data.length === 1)
            return Buffer.concat([buffers.packVarInt(0), buffers.packInt32LE(0)]);

        var ind = data.indexOf(h);
        if (ind < 0)
            return undefined; // Cant prove; it is not part of this merkle tree

        var branch_len = 0;
        const hash_buffer = Buffer.alloc(0);
        var side_mask = 0;

        for (; data.length > 1; branch_len++) {

            if (data.length % 2 !== 0)
                data.push(data[data.length - 1]);

            if (ind % 2 === 0) {
                // We need right side
                Buffer.concat([hash_buffer, data[ind + 1]]);
                // No need to write side mask because it should already be 0
            } else {
                // We need left side
                Buffer.concat([hash_buffer, data[ind - 1]]);
                side_mask = side_mask & (1 << branch_len);
            }

            // Calculate the next level of the merkle root.
            const newData = [];
            for (var i = 0; i < data.length; i += 2)
                newData.push(_merkleJoin(data[i], data[i + 1]));

            data = newData;
            ind = Math.floor(ind / 2);
        }
        branch_len++;
        return Buffer.concat([buffers.packVarInt(branch_len), hash_buffer, buffers.serializeNumber(side_mask)]);
    }
};

function _merkleJoin(h1, h2) {
    const joined = Buffer.concat([h1, h2]);
    return buffers.sha256d(joined);
}

/*
 An exact copy of python's range feature. Written by Tadeck:
 http://stackoverflow.com/a/8273091
 */
function _range(start, stop, step) {

    if (typeof stop === 'undefined') {
        stop = start;
        start = 0;
    }

    if (typeof step === 'undefined') {
        step = 1;
    }

    if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
        return [];
    }

    const result = [];
    for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
        result.push(i);
    }

    return result;
}
