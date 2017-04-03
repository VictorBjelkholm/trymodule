#! /usr/bin/env node

var repl = require('repl')
var path = require('path')
var os = require('os')
var colors = require('colors')
var replHistory = require('repl.history')
var vm = require('vm')
var exec = require('child_process').exec
var loadPackages = require('./index')
var isPromise = require('is-promise')

const TRYMODULE_PATH = process.env.TRYMODULE_PATH || path.resolve((os.homedir()), '.trymodule')
const TRYMODULE_HISTORY_PATH = process.env.TRYMODULE_HISTORY_PATH || path.resolve(TRYMODULE_PATH, 'repl_history')

const flags = []
const packages = {} // data looks like [moduleName, as]

const makeVariableFriendly = str => str.replace(/-|\./g, '_')

process.argv.slice(2).forEach(arg => {
  if (arg[0] === '-') {
    // matches '--clear', etc
    flags.push(arg)
  } else if (arg.indexOf('=') > -1) {
    // matches 'lodash=_', etc
    const i = arg.indexOf('=')
    const module = arg.slice(0, i) // 'lodash'
    const as = arg.slice(i + 1) // '_'
    packages[module] = makeVariableFriendly(as) // ['lodash', '_']
  } else {
    // assume it's just a regular module name: 'lodash', 'express', etc
    packages[arg] = makeVariableFriendly(arg) // call it the module's name
  }
})

if (!flags.length && !Object.keys(packages).length) {
  throw new Error('You need to provide some arguments!')
}

const logGreen = (msg) => console.log(colors.green(msg))

const hasFlag = (flag) => flags.indexOf(flag) > -1

const addPackageToObject = (obj, pkg) => {
  logGreen(`Package '${pkg.name}' was loaded and assigned to '${pkg.as}' in the current scope`)
  obj[pkg.as] = pkg.package
  return obj
}

if (hasFlag('--clear')) {
  console.log(`Removing folder ${TRYMODULE_PATH + '/node_modules'}`)
  exec('rm -r ' + TRYMODULE_PATH + '/node_modules', (err, stdout, stderr) => {
    if (!err) {
      logGreen('Cache successfully cleared!')
      process.exit(0)
    } else {
      throw new Error('Could not remove cache! Error ' + err)
    }
  })
} else {
  logGreen('Gonna start a REPL with packages installed and loaded for you')

  // Extract
  loadPackages(packages, TRYMODULE_PATH).then((packages) => {
    const contextPackages = packages.reduce((context, pkg) => {
      return addPackageToObject(context, pkg)
    }, {})
    console.log('REPL started...')
    if (!process.env.TRYMODULE_NONINTERACTIVE) {
      var replServer = repl.start({
        prompt: '> ',
        eval: function evalWithPromises (cmd, context, filename, callback) {
          const script = new vm.Script(cmd)
          var result = script.runInContext(replServer.context)
          // Some libraries use non-native Promise implementations
          // (ie lib$es6$promise$promise$$Promise)
          if (isPromise(result)) {
            console.log('Returned a Promise. waiting for result...')
            result.then(function (val) {
              callback(null, val)
            })
            .catch(function (err) {
              callback(err)
            })
          } else {
            callback(null, result)
          }
        }
      })
      replHistory(replServer, TRYMODULE_HISTORY_PATH)
      replServer.context = Object.assign(replServer.context, contextPackages)
    }
  })
}
