const packageJson = require('./package.json');
const walletConfig = require('./lib/settings').wallet;

module.exports = function (app) {
  app.use('/version', function(req,res){
    res.type('text/json');
    res.end(
`{
  version:  ${packageJson.version},
  env: {
    NODE_ENV: ${process.env.NODE_ENV},
    EQUIBIT_CORE_URL: ${process.env.EQUIBIT_CORE_URL}
  },
  wallet: {
    host: ${walletConfig.host},
    port: ${walletConfig.port}
  }
}`
    );
  });
}