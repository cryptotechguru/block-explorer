const mongoose = require('mongoose')

const TxSchema = new mongoose.Schema({
  txid: { type: String, lowercase: true, unique: true },
  version: { type: Number },
  size: { type: Number },
  vsize: { type: Number },
  locktime: { type: Number, default: 0 },
  vin: { type: Array, default: [] },
  vout: { type: Array, default: [] },
  EQB_type: { type: Number },
  EQB_payload: { type: String },
  hex: { type: String, lowercase: true, unique: true },
  time: { type: Number },
})

const BlockSchema = new mongoose.Schema({
  hash: { type: String, lowercase: true, unique: true, index: true },
  size: { type: Number },
  weight: { type: Number },
  height: { type: Number },
  version: { type: Number },
  merkleroot: { type: String, lowercase: true },
  tx: { type: Array },
  fulltx: [ TxSchema ],
  time: { type: Number },
  mediantime: { type: Number },
  bits: { type: String, lowercase: true },
  nonce: { type: Number },
  difficulty: { type: Number },
  chainwork: { type: String, lowercase: true },
  previousblockhash: { type: String, lowercase: true },
  nextblockhash: { type: String, lowercase: true },
}, { id: false })

module.exports = mongoose.model('Block', BlockSchema)
