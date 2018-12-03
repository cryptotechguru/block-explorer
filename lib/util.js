const spawn = require('child_process').spawn

module.exports = {
  deepEqual(a, b) {
    if (!(a instanceof Object) || !(b instanceof Object)) return a === b
    if (Object.keys(a).filter(k => !b.hasOwnProperty(k)).length || Object.keys(b).filter(k => !a.hasOwnProperty(k)).length) return false
    return !Object.keys(a).concat(Object.keys(b)).map(k => module.exports.deepEqual(a[k], b[k])).includes(false)
  },

  /**
   * Takes an async function whose last parameter is a callback and returns a promise that resolves
   * (with all the returned values) when the callback is called.
   * @param {Function} func function whose last parameter is a callback
   * @param  {...any} args arguments for the function
   * @returns {Promise} promise that resolves with returned values when async task is complete (i.e. the callback is called)
   */
  promisify(func, ...args) {
    return new Promise((resolve, reject) => {
      func(...args, (...cbArgs) => resolve(...cbArgs))
    })
  },

  /**
   * Like promisify except for functions where the callback isn't at the last position
   * @param {Function} func function with a callback parameter
   * @param {Int} cbPos Index the callback is at in the function
   * @param  {...any} args remaining arguments passed to the function
   * @returns {Promise} promise that resolves with returned values when async task is complete
   */
  promisifyPos(func, cbPos, ...args) {
    return new Promise((resolve, reject) => {
      func(...args.slice(0, cbPos), (...cbArgs) => resolve(...cbArgs), ...args.slice(cbPos))
    })
  },

  spawnCmd(cmd, options, hooks = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, options)
      child.stdout.setEncoding('utf-8')
      child.stderr.setEncoding('utf-8')

      child.stdout.on('data', chunk => {
        console.log(chunk)
      })
      child.stderr.on('data', chunk => {
        console.log('ERROR: ' + chunk)
      })
      child.on('close', code => {
        console.log(`Process exited with code ${code}`)
        resolve(code)
      })
      child.on('error', err => {
        console.log(`Process exited with error: ${err}`)
        reject(err)
      })
    })
  },

  prettyPrint(obj) {
    return JSON.stringify(obj, null, 2)
  }
}