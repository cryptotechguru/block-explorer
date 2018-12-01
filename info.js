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
    EQUIBIT_CORE_URL: ${process.env.EQUIBIT_CORE_URL},
    EQUIBIT_CORE_USERNAME: ${process.env.EQUIBIT_CORE_USERNAME && process.env.EQUIBIT_CORE_USERNAME.substring(0, 3)}...,
    EQUIBIT_CORE_PASSWORD: ${process.env.EQUIBIT_CORE_PASSWORD && process.env.EQUIBIT_CORE_PASSWORD.substring(0, 3)}...
  },
  wallet: {
    host: ${walletConfig.host},
    port: ${walletConfig.port},
    user: ${walletConfig.user && walletConfig.user.substring(0, 3)}...,
    pass: ${walletConfig.pass && walletConfig.pass.substring(0, 3)}...
  }
}`
    );
  });
}