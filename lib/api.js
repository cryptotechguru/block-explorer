const express = require('express')
const debug = require('debug')('explorer:api')
const Client = require('bitcoin-core')

const SpecTypes = Object.freeze({ 'ALL': 0, 'ONLY': 1, 'EXCEPT': 2 })
const CacheTypes = Object.freeze({ 'FORCE': 0, 'NEVER': 1, 'AS_NEEDED': 2 })

class Api {

  constructor ({
    rpcConfig = {
      type: SpecTypes.ALL,
      cacheDefault: CacheTypes.FORCE,
      allowRaw: false,
      rpc: []
    },
    cachers,
    wallet
  }) {
    this.app = express()
    this.rpcConfig = rpcConfig
    this.walletDetails = wallet
    this.client = new Client(wallet)
    this.cachers = cachers

    this.app.get('*', this.hasAccess.bind(this), (req, res) => {
      const method = req.path.substr(1)
      if (Api.requiresCredentials.includes(method) && !this.client.password) {
        return res.send('A wallet password is required and has not been set.')
      }
      const parameters = (req.query instanceof Array ? req.query : Object.values(req.query)).map(param => isNaN(param) ? param : parseFloat(param))

      switch (this.getCacheType(method)) {
        case CacheTypes.FORCE:
          return this.cachers.hasOwnProperty(method)
            ? this.cachers[method](...parameters).then(this.handle).then(resp => res.send(resp))
            : res.send(`No caching method was supplied for ${method}.`)
        case CacheTypes.NEVER:
          return this.client.command([ { method, parameters } ]).then(([ resp, err ]) => {
            res.send(this.handle(resp, err))
          })
        case CacheTypes.AS_NEEDED:
          if (!this.cachers.hasOwnProperty(method)) return res.send(this.rawRpc(method, parameters))
          return db.rpc[method](...parameters).then(this.handle).then(resp => resp.includes('There was an error')
            ? this.rawRpc(method, parameters)
            : resp
          ).then(resp => res.send(resp))
      }
    })
  }

  async rawRpc (method, parameters) {
    return this.client.command([ { method, parameters } ]).then(([ resp, err ]) => this.handle(resp, err))
  }

  async callRawRpc (method, parameters) {
    return this.rpcConfig.allowRaw ? this.rawRpc(method, parameters) : 'Direct RPC calls are not enabled.'
  }

  getCacheType (method) {
    if (this.rpcConfig.type === SpecTypes.ONLY) {
      return Object.values(CacheTypes).includes(this.rpcConfig.rpc[method])
        ? this.rpcConfig.rpc[method]
        : this.rpcConfig.cacheDefault
    }
    return this.rpcConfig.cacheDefault
  }

  handle (data, err) {
    if (err) {
      console.log(err)
      return 'There was an error, check your console.'
    }
    // if its an object just send it as is, otherwise cast to string
    return (data instanceof Object) ? data : (''+data)
  }

  hasAccess (req, res, next) {
    if (this.rpcConfig.type === SpecTypes.ALL) return next()
    
    const method = req.path.substr(1)
    if (
      (this.rpcConfig.type === SpecTypes.ONLY && this.rpcConfig.rpc.includes(method))
      || (this.rpcConfig.type === SpecTypes.EXCEPT && !this.rpcConfig.rpc.includes(method))
    ) {
      return next()
    } else {
      res.end('This method is restricted')
    }
  }

  setCredentials (creds) {
    this.client = new Client({ ...this.walletDetails, creds })
  }

  setCachers (cachers) {
    this.cachers = cachers
  }

  static get requiresCredentials () {
    return [
      'dumpprivkey',
      'importprivkey',
      'keypoolrefill',
      'sendfrom',
      'sendmany',
      'sendtoaddress',
      'signmessage',
      'signrawtransaction'
    ]
  }

}

const api = new Api({
  rpcConfig: {
    type: SpecTypes.ONLY,
    cacheDefault: CacheTypes.FORCE,
    allowRaw: true,
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
  }
})

module.exports = {
  api,
  SpecTypes,
  CacheTypes
}
