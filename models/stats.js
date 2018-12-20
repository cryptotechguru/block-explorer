var mongoose = require('mongoose')
  , Schema = mongoose.Schema;
 
var StatsSchema = new Schema({
  coin: { type: String },
  blocks: { type: Number, default: 1 },
  currentblockweight: { type: Number, default: 4000 },
  currentblocktx: { type: Number, default: 0 },
  difficulty: { type: String, default: 1 },
  networkhashps: { type: String, default: 'N/A' },
  pooledtx: { type: Number, default: 0 },
  chain: { type: String },
  warnings: { type: String, default: "" },
  supply: { type: Number, default: 0 },
  connections: { type: Number, default: 0 },
  bestblock: { type: String, lowercase: true },
  transactions: { type: Number, default: 0 },
  txouts: { type: Number, default: 0 },
  bogosize: { type: Number, default: 0 },
  hash_serialized_2: { type: String, lowercase: true },
  disk_size: { type: Number, default: 0 },
  last_price: { type: Number, default: 0 }
});

module.exports = mongoose.model('stats', StatsSchema);