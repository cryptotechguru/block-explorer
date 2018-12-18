const express = require('express')
const debug = require('debug')('explorer:api')
const Client = require('bitcoin-core')
const settings = require('./settings')
const db = require('./database')

const SpecTypes = Object.freeze({ 'ALL': 0, 'ONLY': 1, 'EXCEPT': 2 })
const CacheTypes = Object.freeze({ 'FORCE': 0, 'NEVER': 1 })

class Api {
  
  constructor ({ rpcConfig, wallet }) {
    this.app = express()
    this.allowedRpc = rpcConfig
    this.walletDetails = wallet
    this.client = new Client(wallet)

    this.app.get('*', this.hasAccess.bind(this), (req, res) => {
      const method = req.path.substr(1)
      if (Api.requiresCredentials.includes(method) && !this.client.password) {
        return res.send('A wallet password is required and has not been set.')
      }
      const parameters = (req.query instanceof Array ? req.query : Object.values(req.query)).map(param => isNaN(param) ? param : parseFloat(param))

      switch (this.getCacheType(method)) {
        case CacheTypes.FORCE:
          return db[method](...parameters).then(this.handle).then(resp => res.send(resp))
        case CacheTypes.NEVER:
          return this.client.command([ { method, parameters } ]).then(([ resp, err ]) => {
            res.send(this.handle(resp, err))
          })
      }
    })
  }

  getCacheType(method) {
    if (this.allowedRpc.type === SpecTypes.ONLY) {
      return Object.values(CacheTypes).includes(this.allowedRpc.rpc[method])
        ? this.allowedRpc.rpc[method]
        : this.allowedRpc.cacheDefault
    }
    return this.allowedRpc.cacheDefault
  }

  handle(data, err) {
    if (err) {
      console.log(err)
      return 'There was an error, check your console.'
    }
    // if its an object just send it as is, otherwise cast to string
    return (data instanceof Object) ? data : (''+data)
  }

  hasAccess(req, res, next) {
    if (this.allowedRpc.type === SpecTypes.ALL) return next()
    
    const method = req.path.substr(1)
    if (
      (this.allowedRpc.type === SpecTypes.ONLY && this.allowedRpc.rpc.includes(method))
      || (this.allowedRpc.type === SpecTypes.EXCEPT && !this.allowedRpc.rpc.includes(method))
    ) {
      return next()
    } else {
      res.end('This method is restricted')
    }
  }

  setCredentials(creds) {
    this.client = new Client({ ...this.walletDetails, creds })
  }

  static get requiresCredentials() {
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

module.exports = {
  Api,
  SpecTypes,
  CacheTypes
}
