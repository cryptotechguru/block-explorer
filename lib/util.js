module.exports = {
  deepEqual(a, b) {
    if (!(a instanceof Object) || !(b instanceof Object)) return a === b
    if (Object.keys(a).filter(k => !b.hasOwnProperty(k)).length || Object.keys(b).filter(k => !a.hasOwnProperty(k)).length) return false
    return !Object.keys(a).concat(Object.keys(b)).map(k => module.exports.deepEqual(a[k], b[k])).includes(false)
  },

  promisify(func, ...args) {
    return new Promise((resolve, reject) => {
      func(...args, (...cbArgs) => resolve(...cbArgs))
    })
  },

  promisifyPos(func, cbPos, ...args) {
    return new Promise((resolve, reject) => {
      func(...args.slice(0, cbPos), (...cbArgs) => resolve(...cbArgs), ...args.slice(cbPos))
    })
  }
}