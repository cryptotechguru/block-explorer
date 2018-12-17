const express = require('express')
const debug = require('debug')('explorer:api')
const Client = require('bitcoin-core')
const settings = require('./settings')
const db = require('./database')

const AccessTypes = Object.freeze({ 'ALL': 0, 'ONLY': 1, 'EXCEPT': 2 })

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
      const params = (req.query instanceof Array ? req.query : Object.values(req.query)).map(param => isNaN(param) ? param : parseFloat(param))
      // res.send(await this.client[method](...params))
      this.client.command([ { method, params } ]).then(([ resp, err ]) => {
        if (err) {
          console.log(err)
          res.send('There was an error, check your console.')
        } else res.send(resp)
      })
    })
  }

  hasAccess(req, res, next) {
    if (this.allowedRpc.type === AccessTypes.ALL) return next()
    
    const method = req.path.substr(1)
    if (
      (this.allowedRpc.type === AccessTypes.ONLY && this.allowedRpc.rpc.includes(method))
      || (this.allowedRpc.type === AccessTypes.EXCEPT && !this.allowedRpc.rpc.includes(method))
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
  AccessTypes
}
