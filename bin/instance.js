#!/usr/bin/env node
const debug = require('debug')('explorer')
const settings = require('../lib/settings')
const db = require('../lib/database')
const app = require('../app')

app.set('port', process.env.PORT || settings.port)

db.connect(settings.dbsettings).then(() => {
  const server = app.listen(app.get('port'), () => {
    debug('Express server listening on port ' + server.address().port)
  })
})
