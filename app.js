const express = require('express'),
  debug = require('debug')('explorer'),
  path = require('path'),
  bitcoinapi = require('bitcoin-node-api'),
  favicon = require('static-favicon'),
  logger = require('morgan'),
  cookieParser = require('cookie-parser'),
  bodyParser = require('body-parser'),
  request = require('request'),
  settings = require('./lib/settings'),
  routes = require('./routes/index'),
  lib = require('./lib/explorer'),
  db = require('./lib/database'),
  locale = require('./lib/locale'),
  { promisify, spawnCmd } = require('./lib/util')

const app = express();

// set database update intervals
spawnCmd('node', [ 'scripts/sync.js', 'index', settings.index.index_mode || 'update' ])
setInterval(function () {
  spawnCmd('node', [ 'scripts/sync.js', 'index', 'update' ])
}, settings.sync_timeout)
setInterval(function () {
  spawnCmd('node', [ 'scripts/sync.js', 'market' ])
}, settings.market_timeout)
setInterval(function () {
  spawnCmd('node', [ 'scripts/peers.js' ])
}, settings.peer_timeout)

const info = require('./info');
info(app)

// bitcoinapi
bitcoinapi.setWalletDetails(settings.wallet);
if (settings.heavy != true) {
  bitcoinapi.setAccess('only', [ 'getinfo', 'getnetworkhashps', 'getmininginfo','getdifficulty', 'getconnectioncount',
    'getblockcount', 'getblockhash', 'getblock', 'getrawtransaction', 'getpeerinfo', 'gettxoutsetinfo', 'getmempoolinfo', 'getrawmempool' ]);
} else {
  // enable additional heavy api calls
  /*
    getvote - Returns the current block reward vote setting.
    getmaxvote - Returns the maximum allowed vote for the current phase of voting.
    getphase - Returns the current voting phase ('Mint', 'Limit' or 'Sustain').
    getreward - Returns the current block reward, which has been decided democratically in the previous round of block reward voting.
    getnextrewardestimate - Returns an estimate for the next block reward based on the current state of decentralized voting.
    getnextrewardwhenstr - Returns string describing how long until the votes are tallied and the next block reward is computed.
    getnextrewardwhensec - Same as above, but returns integer seconds.
    getsupply - Returns the current money supply.
    getmaxmoney - Returns the maximum possible money supply.
  */
  bitcoinapi.setAccess('only', [ 'getinfo', 'getstakinginfo', 'getnetworkhashps', 'getdifficulty', 'getconnectioncount',
    'getblockcount', 'getblockhash', 'getblock', 'getrawtransaction','getmaxmoney', 'getvote',
    'getmaxvote', 'getphase', 'getreward', 'getnextrewardestimate', 'getnextrewardwhenstr',
    'getnextrewardwhensec', 'getsupply', 'gettxoutsetinfo', 'getmempoolinfo', 'getrawmempool' ]);
}
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(favicon(path.join(__dirname, settings.favicon)));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// routes
app.use('/api', bitcoinapi.app);
app.use('/', routes);
app.use('/ext/getmoneysupply', function(req,res){
  lib.get_supply(function(supply){
    res.send(' '+supply);
  });
});

app.use('/ext/getaddress/:hash', function(req,res){
  db.get_address(req.param('hash'), function(address){
    if (address) {
      var a_ext = {
        address: address.a_id,
        sent: (address.sent / 100000000),
        received: (address.received / 100000000),
        balance: (address.balance / 100000000).toString().replace(/(^-+)/mg, ''),
        last_txs: address.txs,
      };
      res.send(a_ext);
    } else {
      res.send({ error: 'address not found.', hash: req.param('hash')})
    }
  });
});

app.use('/ext/getbalance/:hash', function(req,res){
  db.get_address(req.param('hash'), function(address){
    if (address) {
      res.send((address.balance / 100000000).toString().replace(/(^-+)/mg, ''));
    } else {
      res.send({ error: 'address not found.', hash: req.param('hash')})
    }
  });
});

app.use('/ext/getdistribution', function(req,res){
  db.get_richlist(settings.coin, function(richlist){
    db.get_stats(settings.coin, function(stats){
      db.get_distribution(richlist, stats, function(dist){
        res.send(dist);
      });
    });
  });
});

app.use('/ext/getlasttxs', function (req, res) {
  return db.get_last_txs(parseInt(req.query.count), req.query.minAmount * 100000000, req.query.start).then(txs =>
    res.send({data: txs})
  ).catch(err => {
    debug(err)
    res.send({ error: `An error occurred: ${err}` })
  })
});

app.use('/ext/getblocks/:start/:end', function (req, res) {
  const start = parseInt(req.param('start'))
  const end = parseInt(req.param('end'))
  const reverse = req.query.reverse && req.query.reverse.toLowerCase() === 'true'
  const strip = req.query.strip && req.query.strip.toLowerCase() === 'true'
  if (start > end) {
    res.send({ error: `End blockheight must be greater than or equal to the start blockheight.` })
    return
  }

  let heights = Array(end - start + 1).fill(undefined).map((_, i) => start + i)
  const txReq = () => Promise.all(heights.map(i =>
    db.getTxs({ height: i }).then(txs => {
      // sorts transactions from newest to oldest
      txs.sort((a, b) => {
        if (a.blockindex !== b.blockindex) return a.blockindex > b.blockindex ? -1 : 1
        if (a.timestamp !== b.timestamp) return a.timestamp > b.timestamp ? -1 : 1
        return a._id > b._id ? -1 : 1
      })
      // since reverse means to go from newest to oldest
      return reverse ? txs : txs.reverse()
    })
  ))
  const infoReq = () => Promise.all(heights.map(i =>
    promisify(lib.get_blockhash, i)
      .then(hash => {
        if (hash.includes('There was an error')) return Array(3).fill(null)
        return promisify(request, `http://test-explorer.equibitgroup.com/api/getblock?hash=${hash}`, { json: true })
      }).then(([err, resp, body]) => body)
  )).then(infos => strip ? infos.filter(info => info !== null) : infos)
  const onErr = err => {
    debug(err)
    res.send({ error: `An error occurred: ${err}` })
  }

  promisify(request, `http://test-explorer.equibitgroup.com/api/getblockcount`, { json: true }).then(([ err, resp, height ]) => {
    if (reverse) heights = heights.map(h => height - h + 1)
    return height
  }).then(blockcount => {
    if (req.query.flds === 'summary') {
      infoReq().then(infos => res.send({ data: { blockcount, blocks: infos } })).catch(onErr)
    } else if (req.query.flds && req.query.flds.length === 1 && req.query.flds[0] === 'tx') {
      txReq().then(txs => res.send({ data: { blockcount, blocks: txs } })).catch(onErr)
    } else {
      Promise.all([ txReq(), infoReq() ]).then(([ txs, infos ]) => {
        res.send({
          data: { blockcount, blocks: infos.map((info, i) => ({ ...info, tx: txs[i] })).map(block => {
            if (req.query.flds && req.query.flds.length) {
              Object.keys(block).forEach(key => {
                if (!req.query.flds.includes(key)) delete block[key]
              })
            }
            return block
          }) }
        })
      }).catch(onErr)
    }
  }).catch(onErr)
})

app.use('/ext/connections', function(req,res){
  db.get_peers(function(peers){
    res.send({data: peers});
  });
});

// locals
app.set('title', settings.title);
app.set('symbol', settings.symbol);
app.set('coin', settings.coin);
app.set('locale', locale);
app.set('display', settings.display);
app.set('markets', settings.markets);
app.set('twitter', settings.twitter);
app.set('facebook', settings.facebook);
app.set('googleplus', settings.googleplus);
app.set('youtube', settings.youtube);
app.set('genesis_block', settings.genesis_block);
app.set('index', settings.index);
app.set('heavy', settings.heavy);
app.set('txcount', settings.txcount);
app.set('nethash', settings.nethash);
app.set('nethash_units', settings.nethash_units);
app.set('show_sent_received', settings.show_sent_received);
app.set('logo', settings.logo);
app.set('theme', settings.theme);
app.set('labels', settings.labels);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;
