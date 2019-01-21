const mongoose = require('mongoose'),
  debug = require('debug')('database'),
  Stats = require('../models/stats'),
  Markets = require('../models/markets'),
  Address = require('../models/address'),
  Block = require('../models/block'),
  Richlist = require('../models/richlist'),
  Peers = require('../models/peers'),
  settings = require('./settings'),
  poloniex = require('./markets/poloniex'),
  bittrex = require('./markets/bittrex'),
  bleutrade = require('./markets/bleutrade'),
  cryptsy = require('./markets/cryptsy'),
  cryptopia = require('./markets/cryptopia'),
  yobit = require('./markets/yobit'),
  empoex = require('./markets/empoex'),
  ccex = require('./markets/ccex'),
  lib = require('./explorer'),
  { promisify, prettyPrint, renameProp, wait } = require('./util')

function find_address(hash, cb) {
  Address.findOne({a_id: hash}, function(err, address) {
    if(address) {
      return cb(address);
    } else {
      return cb();
    }
  });
}

function find_richlist(coin, cb) {
  Richlist.findOne({coin: coin}, function(err, richlist) {
    if(richlist) {
      return cb(richlist);
    } else {
      return cb();
    }
  });
}

function update_address(hash, txid, amount, type, cb) {
  // Check if address exists
  find_address(hash, function(address) {
    if (address) {
      // if coinbase (new coins PoW), update sent only and return cb.
      if ( hash == 'coinbase' ) {
        Address.update({a_id:hash}, {
          sent: address.sent + amount,
		      balance: 0,
        }, function() {
          return cb();
        });
      } else {
        // ensure tx doesnt already exist in address.txs
        lib.is_unique(address.txs, txid, function(unique, index) {
          var tx_array = address.txs;
          var received = address.received;
          var sent = address.sent;
          if (type == 'vin') {
            sent = sent + amount;
          } else {
            received = received + amount;
          }
          if (unique == true) {
            tx_array.push({addresses: txid, type: type});
            if ( tx_array.length > settings.txcount ) {
              tx_array.shift();
            }
            Address.update({a_id:hash}, {
              txs: tx_array,
              received: received,
              sent: sent,
              balance: received - sent
            }, function() {
              return cb();
            });
          } else {
            if (type == tx_array[index].type) {
              return cb(); //duplicate
            } else {
              Address.update({a_id:hash}, {
                txs: tx_array,
                received: received,
                sent: sent,
                balance: received - sent
              }, function() {
                return cb();
              });
            }
          }
        });
      }
    } else {
      //new address
      if (type == 'vin') {
        var newAddress = new Address({
          a_id: hash,
          txs: [ {addresses: txid, type: 'vin'} ],
          sent: amount,
          balance: amount,
        });
      } else {
        var newAddress = new Address({
          a_id: hash,
          txs: [ {addresses: txid, type: 'vout'} ],
          received: amount,
          balance: amount,
        });
      }

      newAddress.save(function(err) {
        if (err) {
          return cb(err);
        } else {
          //console.log('address saved: %s', hash);
          //console.log(newAddress);
          return cb();
        }
      });
    }
  });
}

async function findTx (txid) {
  const [ err, block ] = await promisify(Block.findOne.bind(Block), { tx: txid })
  if (err) throw new Error(err)
  else return parseTx(block, txid)
}

async function parseTx(block, i) {
  const tx = i instanceof Object ? i : /[a-z]/i.test(i) ? block.fulltx.find(tx => tx.txid === i) : block.fulltx[i]
  const [ vout, vin ] = await lib.prepare_vin(tx).then(vin => promisify(lib.prepare_vout, tx.vout, tx.txid, vin))
  for (const v of vin) await promisify(update_address, v.addresses, tx.txid, v.amount, 'vin')
  for (const v of vout) {
    if (v.addresses) await promisify(update_address, v.addresses, tx.txid, v.amount, 'vout')
  }
  const total = await promisify(lib.calculate_total, vout)
  return {
    txid: tx.txid,
    vin,
    vout,
    total,
    timestamp: tx.time,
    blockhash: block.hash,
    blockindex: block.height
  }
}

function get_market_data(market, cb) {
  switch(market) {
    case 'bittrex':
      bittrex.get_data(settings.markets.coin, settings.markets.exchange, function(err, obj){
        return cb(err, obj);
      });
      break;
    case 'bleutrade':
      bleutrade.get_data(settings.markets.coin, settings.markets.exchange, function(err, obj){
        return cb(err, obj);
      });
      break;
    case 'poloniex':
      poloniex.get_data(settings.markets.coin, settings.markets.exchange, function(err, obj){
        return cb(err, obj);
      });
      break;
    case 'cryptsy':
      cryptsy.get_data(settings.markets.coin, settings.markets.exchange, settings.markets.cryptsy_id, function(err, obj){
        return cb(err, obj);
      });
      break;
    case 'cryptopia':
      cryptopia.get_data(settings.markets.coin, settings.markets.exchange, settings.markets.cryptopia_id, function (err, obj) {
        return cb(err, obj);
      });
      break;
    case 'ccex':
      ccex.get_data(settings.markets.coin.toLowerCase(), settings.markets.exchange.toLowerCase(), settings.markets.ccex_key, function (err, obj) {
        return cb(err, obj);
      });
      break;
    case 'yobit':
      yobit.get_data(settings.markets.coin.toLowerCase(), settings.markets.exchange.toLowerCase(), function(err, obj){
        return cb(err, obj);
      });
      break;
    case 'empoex':
      empoex.get_data(settings.markets.coin, settings.markets.exchange, function(err, obj){
        return cb(err, obj);
      });
      break;
    default:
      return cb(null);
  }
}

function dbToRpcBlock (block, blockcount, include) {
  return Object.entries({
    confirmations: block.height ? blockcount - block.height : undefined,
    strippedsize: block.size,
    versionHex: block.version ? block.version.toString(16) : undefined,
    nTx: block.tx ? block.tx.length : undefined
  })
    .filter(([ key, value ]) => value !== undefined && (!include || include.includes(key)))
    .reduce((acc, [ key, value ]) => ({ ...acc, [key]: value }), { ...block })
}

const rpcOnError = (method, err) => {
  debug(`An error occurred while trying access cache of ${method}: ${err}`)
  return null
}
const rpc = {

  getnetworkhashps () {
    return promisify(Stats.findOne.bind(Stats), { coin: settings.coin }, { networkhashps: 1, _id: 0 }).then(([ err, res ]) => {
      if (err) return rpcOnError('getnetworkhashps', err)
      return res.networkhashps
    })
  },

  getmininginfo () {
    return promisify(Stats.findOne.bind(Stats), { coin: settings.coin }, { _id: 0 }).then(([ err, res ]) => {
      if (err) return rpcOnError('getmininginfo', err)
      return res
    })
  },

  getdifficulty () {
    return promisify(Stats.findOne.bind(Stats), { coin: settings.coin }, { difficulty: 1, _id: 0 }).then(([ err, res ]) => {
      if (err) return rpcOnError('getdifficulty', err)
      return res.difficulty
    })
  },

  getconnectioncount () {
    return promisify(Stats.findOne.bind(Stats), { coin: settings.coin }, { connections: 1, _id: 0 }).then(([ err, res ]) => {
      if (err) return rpcOnError('getconnectioncount', err)
      return res.connections
    })
  },

  getblockcount () {
    return promisify(Stats.findOne.bind(Stats), { coin: settings.coin }, { blocks: 1, _id: 0 }).then(([ err, res ]) => {
      if (err) return rpcOnError('getdifficulty', err)
      return res.blocks
    })
  },

  getblockhash (height) {
    return promisify(Block.findOne.bind(Block), { height }, { hash: 1, _id: 0 }).then(([ err, res ]) => {
      if (err) return rpcOnError('getblockhash', err)
      return res.hash
    })
  },

  async getblock (hash) {
    const blockcount = await promisify(Stats.findOne.bind(Stats), { coin: settings.coin }, { blocks: 1, _id: 0 }).then(([ err, stats ]) => {
      if (err) return rpcOnError('getblock', err)
      return stats.blocks
    })
    return promisify(Block.findOne.bind(Block), { hash }, { fulltx: 0, _id: 0 }).then(([ err, res ]) => {
      if (err) return rpcOnError('getblock', err)
      return dbToRpcBlock(res._doc, blockcount)
    })
  },

  getrawtransaction (txid, format) {
    return promisify(Block.findOne.bind(Block), { fulltx: { $elemMatch: { txid } } }, { fulltx: 1, _id: 0 }).then(([ err, res ]) => {
      if (err) return rpcOnError('getrawtransaction', err)
      const tx = res.fulltx.find(tx => tx.txid === txid)
      return format ? tx : tx.hex
    })
  },

  getpeerinfo () {
    return promisify(Peers.find.bind(Peers), {}, { _id: 0 }).then(([ err, res ]) => {
      if (err) return rpcOnError('getpeerinfo', err)
      return res
    })
  },

  gettxoutsetinfo () {
    return promisify(Stats.findOne.bind(Stats), { coin: settings.coin }, {
      blocks: 1,
      bestblock: 1,
      transactions: 1,
      txouts: 1,
      bogosize: 1,
      hash_serialized_2: 1,
      disk_size: 1,
      supply: 1,
      _id: 0
    }).then(([ err, res ]) => {
      if (err) return rpcOnError('getdifficulty', err)
      return renameProp('supply', 'total_amount', renameProp('blocks', 'height', res))
    })
  },

  getmempoolinfo () {

  },

  getrawmempool () {

  }

}

module.exports = {
  rpc,

  connect (dbSettings) {
    return promisify(mongoose.connect, dbSettings.uri, dbSettings.options).catch(err => {
      console.log(`Unable to connect to database: ${dbSettings.uri}`);
      console.log(`With options: ${prettyPrint(dbSettings.options, null, 2)}`);
      console.log(`Aborting with ERROR: ${prettyPrint(err)}`)
      throw new Error(err)
    });
  },

  check_stats: function(coin, cb) {
    Stats.findOne({coin: coin}, function(err, stats) {
      if(stats) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  get_stats: function(coin, cb) {
    Stats.findOne({coin: coin}, function(err, stats) {
      if(stats) {
        return cb(stats);
      } else {
        return cb(null);
      }
    });
  },

  create_stats: function(coin, cb) {
    var newStats = new Stats({
      coin: coin,
    });

    newStats.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial stats entry created for %s", coin);
        //console.log(newStats);
        return cb();
      }
    });
  },

  get_address: function(hash, cb) {
    find_address(hash, function(address){
      return cb(address);
    });
  },

  get_richlist: function(coin, cb) {
    find_richlist(coin, function(richlist){
      return cb(richlist);
    });
  },
  //property: 'received' or 'balance'
  update_richlist: function(list, cb){
    if(list == 'received') {
      Address.find({}).sort({received: 'desc'}).limit(100).exec(function(err, addresses){
        Richlist.update({coin: settings.coin}, {
          received: addresses,
        }, function() {
          return cb();
        });
      });
    } else { //balance
      Address.find({}).sort({balance: 'desc'}).limit(100).exec(function(err, addresses){
        Richlist.update({coin: settings.coin}, {
          balance: addresses,
        }, function() {
          return cb();
        });
      });
    }
  },

  async get_tx (txid, cb) {
    const tx = await findTx(txid)
    return cb ? cb(await tx) : tx
  },

  async getTxs (block) {
    return promisify(Block.findOne.bind(Block), block).then(([ err, block ]) =>
      err || !block ? null : Promise.all(block.tx.map(tx => parseTx(block, tx)))
    )
  },

  create_market: function(coin, exchange, market, cb) {
    var newMarkets = new Markets({
      market: market,
      coin: coin,
      exchange: exchange,
    });

    newMarkets.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial markets entry created for %s", market);
        //console.log(newMarkets);
        return cb();
      }
    });
  },

  // checks market data exists for given market
  check_market: function(market, cb) {
    Markets.findOne({market: market}, function(err, exists) {
      if(exists) {
        return cb(market, true);
      } else {
        return cb(market, false);
      }
    });
  },

  // gets market data for given market
  get_market: function(market, cb) {
    Markets.findOne({market: market}, function(err, data) {
      if(data) {
        return cb(data);
      } else {
        return cb(null);
      }
    });
  },

  // creates initial richlist entry in database; called on first launch of explorer
  create_richlist: function(coin, cb) {
    var newRichlist = new Richlist({
      coin: coin,
    });
    newRichlist.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial richlist entry created for %s", coin);
        //console.log(newRichlist);
        return cb();
      }
    });
  },
  // checks richlist data exists for given coin
  check_richlist: function(coin, cb) {
    Richlist.findOne({coin: coin}, function(err, exists) {
      if(exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  get_distribution: function(richlist, stats, cb){
    var distribution = {
      supply: stats.supply,
      t_1_25: {percent: 0, total: 0 },
      t_26_50: {percent: 0, total: 0 },
      t_51_75: {percent: 0, total: 0 },
      t_76_100: {percent: 0, total: 0 },
      t_101plus: {percent: 0, total: 0 }
    };
    lib.syncLoop(richlist.balance.length, function (loop) {
      var i = loop.iteration();
      var count = i + 1;
      var percentage = ((richlist.balance[i].balance / 100000000) / stats.supply) * 100;
      if (count <= 25 ) {
        distribution.t_1_25.percent = distribution.t_1_25.percent + percentage;
        distribution.t_1_25.total = distribution.t_1_25.total + (richlist.balance[i].balance / 100000000);
      }
      if (count <= 50 && count > 25) {
        distribution.t_26_50.percent = distribution.t_26_50.percent + percentage;
        distribution.t_26_50.total = distribution.t_26_50.total + (richlist.balance[i].balance / 100000000);
      }
      if (count <= 75 && count > 50) {
        distribution.t_51_75.percent = distribution.t_51_75.percent + percentage;
        distribution.t_51_75.total = distribution.t_51_75.total + (richlist.balance[i].balance / 100000000);
      }
      if (count <= 100 && count > 75) {
        distribution.t_76_100.percent = distribution.t_76_100.percent + percentage;
        distribution.t_76_100.total = distribution.t_76_100.total + (richlist.balance[i].balance / 100000000);
      }
      loop.next();
    }, function(){
      distribution.t_101plus.percent = parseFloat(100 - distribution.t_76_100.percent - distribution.t_51_75.percent - distribution.t_26_50.percent - distribution.t_1_25.percent).toFixed(2);
      distribution.t_101plus.total = parseFloat(distribution.supply - distribution.t_76_100.total - distribution.t_51_75.total - distribution.t_26_50.total - distribution.t_1_25.total).toFixed(8);
      distribution.t_1_25.percent = parseFloat(distribution.t_1_25.percent).toFixed(2);
      distribution.t_1_25.total = parseFloat(distribution.t_1_25.total).toFixed(8);
      distribution.t_26_50.percent = parseFloat(distribution.t_26_50.percent).toFixed(2);
      distribution.t_26_50.total = parseFloat(distribution.t_26_50.total).toFixed(8);
      distribution.t_51_75.percent = parseFloat(distribution.t_51_75.percent).toFixed(2);
      distribution.t_51_75.total = parseFloat(distribution.t_51_75.total).toFixed(8);
      distribution.t_76_100.percent = parseFloat(distribution.t_76_100.percent).toFixed(2);
      distribution.t_76_100.total = parseFloat(distribution.t_76_100.total).toFixed(8);
      return cb(distribution);
    });
  },

  // updates market data for given market; called by sync.js
  update_markets_db: function(market, cb) {
    get_market_data(market, function (err, obj) {
      if (err == null) {
        Markets.update({market:market}, {
          chartdata: JSON.stringify(obj.chartdata),
          buys: obj.buys,
          sells: obj.sells,
          history: obj.trades,
          summary: obj.stats,
        }, function() {
          if ( market == settings.markets.default ) {
            Stats.update({coin:settings.coin}, {
              last_price: obj.stats.last,
            }, function(){
              return cb(null);
            });
          } else {
            return cb(null);
          }
        });
      } else {
        return cb(err);
      }
    });
  },

  create_peer: function(params, cb) {
    var newPeer = new Peers(params);
    newPeer.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        return cb();
      }
    });
  },

  find_peer: function(address, cb) {
    Peers.findOne({address: address}, function(err, peer) {
      if (err) {
        return cb(null);
      } else {
        if (peer) {
         return cb(peer);
       } else {
         return cb (null)
       }
      }
    })
  },

  get_peers: function(cb) {
    Peers.find({}, function(err, peers) {
      if (err) {
        return cb([]);
      } else {
        return cb(peers);
      }
    });
  },
  
  async getBlocks (searchParams, flds) {
    const params = (searchParams.length ? searchParams : [ searchParams ])
    const mode = params.find(param => /[a-z]/i.test(param)) !== undefined ? 'hash' : 'height'
    const blockheight = await rpc.getblockcount()
    return promisify(
      Block[params.length > 1 ? 'find' : 'findOne'].bind(Block),
      { [mode]: { $in: params } },
      flds || {  }
    ).then(([ err, blocks ]) => err || !blocks._doc
      ? null
      : blocks.length
        ? blocks.map(block => dbToRpcBlock(block._doc, blockheight, flds.fulltx === 0 ? null : Object.keys(flds)))
        : dbToRpcBlock(blocks._doc, blockheight, params)
    )
  },

  async updateStats (coin) {
    const txoutinfo = await lib.getRawRpc('gettxoutsetinfo')
    const mininginfo = await lib.getRawRpc('getmininginfo')
    
    // Although schema queries return a thenable Query object, they are not full promises and
    // thus cannot be used with async/await syntax.
    return promisify(Stats.update.bind(Stats), { coin: coin }, {
      blocks: mininginfo.blocks,
      currentblockweight: mininginfo.currentblockweight,
      currentblocktx: mininginfo.currentblocktx,
      difficulty: mininginfo.difficulty,
      networkhashps: mininginfo.networkhashps,
      pooledtx: mininginfo.pooledtx,
      chain: mininginfo.chain,
      warnings: mininginfo.warnings,
      supply: txoutinfo.total_amount,
      connections: await lib.getRawRpc('getconnectioncount'),
      bestblock: txoutinfo.bestblock,
      transactions: txoutinfo.transactions,
      txouts: txoutinfo.txouts,
      bogosize: txoutinfo.bogosize,
      hash_serialized_2: txoutinfo.hash_serialized_2,
      disk_size: txoutinfo.disk_size
    })
  },
  
  async updateDb (start, end, timeout) {
    for (let i = start; i < end; i++) {
      let [ err, block ] = await promisify(Block.findOne.bind(Block), { height: i })
      if (block) continue
  
      block = await lib.getRawRpc('getblock', [ await lib.getRawRpc('getblockhash', [ i ]) ])
      if (!block) {
        debug(`Block #${i} could not be found, skipping.`)
        continue
      } else if (!block.tx) {
        debug(`Block #${i} does not have any transactions, skipping.`)
        continue
      }
  
      debug(`Caching #${i}: ${block.hash}`)
      block.fulltx = await Promise.all(block.tx.map(txid => lib.getRawRpc('getrawtransaction', [ txid, 1 ])))
        .then(txs => txs.map((tx, t) => ({ txid: block.tx[t], ...tx })).filter(tx => !tx.code && !tx.name))
      console.log(`${block.height}: ${block.hash}`)
      await Block.create([ block ])
      if (timeout) await wait(timeout)
    }
  
  },

  setupSchema () {
    return promisify(this.check_stats, settings.coin).then(exists => {
      // setup stats
      if (!exists) {
        debug(`no stats entry found, creating...`)
        return promisify(this.create_stats, settings.coin)
      }
    }).then(() => {
      // check markets
      return Promise.all(settings.markets.enabled.map(market => promisify(this.check_market, market)))
    }).then((results) => {
      // create markets
      return Promise.all(results.map(([ market, exists ]) => {
        if (!exists) {
          debug(`no ${market} entry found, creating...`)
          return promisify(this.create_market, settings.markets.coin, settings.markets.exchange, market)
        }
      }))
    }).then(() => {
      // check richlist
      return promisify(this.check_richlist, settings.coin)
    }).then(exists => {
      // create richlist
      if (!exists) {
        debug(`no richlist entry found, creating...`)
        return promisify(this.create_richlist, settings.coin)
      }
    })
  }
};
