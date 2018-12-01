const mongoose = require('mongoose'),
  db = require('../lib/database'),
  Tx = require('../models/tx'),
  Address = require('../models/address'),
  Richlist = require('../models/richlist'),
  Stats = require('../models/stats'),
  settings = require('../lib/settings'),
  { promisify } = require('../lib/util'),
  fs = require('fs'),
  debug = require('debug')

const validDbs = [ 'index', 'market' ]
const validModes = [ 'update', 'check', 'reindex' ]

// displays usage and exits
function usage() {
  console.log('Usage: node scripts/sync.js [database] [mode]');
  console.log('');
  console.log('database: (required)');
  console.log('index [mode] Main index: coin info/stats, transactions & addresses');
  console.log('market       Market data: summaries, orderbooks, trade history & chartdata')
  console.log('');
  console.log('mode: (required for index database only)');
  console.log('update       Updates index from last sync to current block');
  console.log('check        checks index for (and adds) any missing transactions/addresses');
  console.log('reindex      Clears index then resyncs from genesis to current block');
  console.log('');
  console.log('notes:'); 
  console.log('* \'current block\' is the latest created block when script is executed.');
  console.log('* The market database only supports (& defaults to) reindex mode.');
  console.log('* If check mode finds missing data(ignoring new data since last sync),'); 
  console.log('  index_timeout in settings.json is set too low.')
  console.log('');
  process.exit(0);
}

/**
 * Parse arguments.
 * @param {Array} args Array of commandline arguments, should not not include node path or script path
 * @returns {Object} database to run on and mode to run in
 */
function parseArgs(args) {
  if (args.length < 2 || validDbs.indexOf(args[0]) < 0 || validModes.indexOf(args[1]) < 0) usage()
  // if we're running on markets, then the only valid mode is to 'update'.
  return { database: args[0], mode: args[0] === 'market' ? 'update' : args[1] }
}

/**
 * Creates lock file in tmp directory. Only needed for indexing right now.
 * @param {String} database name of database to create lock for
 * @returns {Promise} resolves when file is written
 */
function createLock(database) {
  if (database === 'index') {
    return promisify(fs.stat, './tmp').then((e, s) => {
      if (e && !s) {
        return promisify(fs.mkdir, './tmp').then(e => {
          if (e) return Promise.reject(e)
          return promisify(fs.appendFile, `./tmp/${database}.pid`, process.pid)
            .then(e => e ? Promise.reject(e) : Promise.resolve())
        })
      }
      return promisify(fs.appendFile, `./tmp/${database}.pid`, process.pid)
        .then(e => e ? Promise.reject(e) : Promise.resolve())
    })
  }
  Promise.resolve()
}

/**
 * Release lock on database. Only needed for indexing right now.
 * @param {String} database name of database to remove lock of
 * @returns {Promise} resolves when file is removed 
 */
function removeLock(database) {
  if (database === 'index') {
    return promisify(fs.unlink, `./tmp/${database}.pid`)
      .then(e => e ? Promise.reject(e) : Promise.resolve())
  }
  return Promise.resolve()
}

/**
 * Checks the lock on database. Only needed for indexing right now.
 * @param {String} database name of database to check lock of
 * @returns {Promise} resolves when check completes 
 */
function isLocked(database) {
  if (database === 'index')
    return promisify(fs.stat, `./tmp/${database}.pid`)
      .then((e, s) => !e && s)
  return Promise.resolve()
}

/**
 * Exit the program.
 */
function exit(database) {
  removeLock(database)
    .then(() => mongoose.disconnect())
    .then(() => process.exit(0))
    .catch(err => {
      debug('Failed to remove lock or disconnect from mongoose cleanly.')
      process.exit(1)
    })
}

////////  MAIN ENTRYPOINT ////////

const { database, mode } = parseArgs(process.argv.slice(2))
isLocked(database).then(exists => {
  // if there's a lock file, exit
  if (exists) {
    debug('Script already running.')
    process.exit()
  }
}).then(() =>
  createLock(database).catch(e => {
    debug('Error: unable to create lock file.')
    process.exit(1)
  })
).then(() => {
  debug('Script launched with pid: ' + process.pid)
  return mongoose.connect(settings.dbsettings.uri, settings.dbsettings.options)
}).then(() => {
  if (database === 'index') {
    return promisify(db.check_stats, settings.coin).then(exists => {
      // check if database has been created yet
      if (!exists) {
        debug('Run \'npm start\' to create database structure before running this script.')
        exit(database)
      }
      return promisify(db.update_db, settings.coin)
    }).then(() =>
      promisify(db.get_stats, settings.coin)
    ).then(stats => Promise.all([
      stats,
      settings.heavy ? promisify(db.update_heavy, settings.coin, stats.count, 20) : undefined
    ])).then(([ stats ]) => {
      if (mode === 'reindex') {
        return promisify(Tx.remove.bind(Tx), {}).then(err =>
          promisify(Address.remove.bind(Address), {})
        ).then(err =>
          promisify(Richlist.update.bind(Richlist), { coin: settings.coin }, { received: [], balance: [] })
        ).then(err =>
          promisify(Stats.update.bind(Stats), { coin: settings.coin }, { last: 0 })
        ).then(() => {
          debug('index cleared (reindex)')
          return promisify(db.update_tx_db, settings.coin, 1, stats.count, settings.update_timeout)
        }).then(() =>
          promisify(db.update_richlist, 'received')
        ).then(() =>
          promisify(db.update_richlist, 'balance')
        ).then(() =>
          promisify(db.get_stats, settings.coin)
        ).then(nstats => {
          debug(`reindex complete (block: ${nstats.last})`)
          exit(database)
        })
      } else if (mode === 'check') {
        return promisify(db.update_tx_db, settings.coin, 1, stats.count, settings.check_timeout).then(() =>
          promisify(db.get_stats, settings.coin)
        ).then(nstats => {
          debug(`check complete (block: ${nstats.last})`)
          exit(database)
        })
      } else if (mode === 'update') {
        return promisify(db.update_tx_db, settings.coin, stats.last, stats.count, settings.update_timeout).then(() =>
          promisify(db.update_richlist, 'received')
        ).then(() =>
          promisify(db.update_richlist, 'balance')
        ).then(() =>
          promisify(db.get_stats, settings.coin)
        ).then(nstats => {
          debug(`update complete (block: ${nstats.last})`)
          exit(database)
        })
      }
    })
  } else {
    return settings.markets.enabled.reduce(async (complete, m) => {
      return await promisify(db.check_market, m).then((m, exists) => {
        complete++
        if (exists) {
          return promisify(db.update_markets_db, m).then(err => {
            if (err) debug(`${m}: ${err}`)
            else debug(`${m} market data updated successfully.`)
            if (complete === markets.length) exit()
            return complete
          })
        }
        debug(`Error: entry for ${m} does not exist in markets db.`)
        if (complete === markets.length) exit()
        return complete
      })
    }, 0)
  }
}).catch(err => {
  console.log(err)
  console.log(`Unable to connect to database: ${settings.dbsettings.uri}.`)
  console.log(`With options: ${JSON.stringify(settings.dbsettings.options, null, 2)}`)
  console.log('Aborting')
  return exit(database)
})
