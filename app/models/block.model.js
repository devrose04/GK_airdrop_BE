const mongoose = require("mongoose");

const Block = mongoose.model(
    "Block",
    new mongoose.Schema({
        blockHeight: {
            type: String,
            default: '0'
        },
        buyers: [
            {
                tx: {
                    type: String,
                    require: true
                },
                ordinalsAddress: {
                    type: String,
                    require: true
                },
                ordinalsPublicKey: {
                    type: String,
                    require: true
                },
                paymentAddress: {
                    type: String,
                    require: true
                },
                paymentPublicKey: {
                    type: String,
                    require: true
                },
                BtcAmount: {
                    type: Number,
                    require: true
                }
            }
        ],
    })
);


module.exports = Block;
