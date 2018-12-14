const mongoose = require('mongoose')

const BlockSchema = new mongoose.Schema({
  hash: { type: String, lowercase: true, unique: true, index: true },
  size: { type: Number },
  weight: { type: Number },
  height: { type: Number },
  version: { type: Number },
  merkleroot: { type: String, lowercase: true },
  tx: { type: Array, default: [] },
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
