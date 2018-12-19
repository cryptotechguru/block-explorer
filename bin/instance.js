#!/usr/bin/env node

// ensure the api singleton has been initialized before anything else
const settings = require('../lib/settings')
const { Api, SpecTypes, CacheTypes } = require('../lib/api')
const api = new Api({
  allowRawRpc: true,
  rpcConfig: {
    type: SpecTypes.ONLY,
    cacheDefault: CacheTypes.FORCE,
    rpc: [
      'getnetworkhashps',
      'getmininginfo',
      'getdifficulty',
      'getconnectioncount',
      'getblockcount',
      'getblockhash',
      'getblock',
      'getrawtransaction',
      'getpeerinfo',
      'gettxoutsetinfo',
      'getmempoolinfo',
      'getrawmempool'
    ]
  },
  wallet: settings.wallet
})

const debug = require('debug')('explorer')
const db = require('../lib/database')
const app = require('../app')
const { promisify } = require('../lib/util')

app.set('port', process.env.PORT || settings.port)

db.connect(settings.dbsettings).then(() =>
  promisify(db.get_stats, settings.coin)
).then((stats) => {
  app.locals.stats = stats
  const server = app.listen(app.get('port'), () => {
    debug('Express server listening on port ' + server.address().port)
  })
})
