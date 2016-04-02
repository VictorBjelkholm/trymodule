#!/usr/bin/env node
var repl = require('repl')
var npmi = require('npmi')
var path = require('path')
var colors = require('colors')
var replHistory = require('repl.history')
var exec = require('child_process').exec
var fs = require('fs')

const TRYMODULE_PATH = process.env.TRYMODULE_PATH || path.resolve((process.env.HOME || process.env.USERPROFILE), '.trymodule')
const TRYMODULE_HISTORY_PATH = process.env.TRYMODULE_HISTORY_PATH || path.resolve(TRYMODULE_PATH, 'repl_history')

if (process.argv[2] === undefined) {
  throw new Error('You need to provide package name as first argument')
}

const logGreen = (msg) => console.log(colors.green(msg))

const takePackageArguments = (args) => args.splice(2)

const packageLocation = (pkg) => path.resolve(TRYMODULE_PATH, 'node_modules', pkg)

const packageName = (pkg) => {
  if (~pkg.indexOf('/')) {
    name = pkg.split('/').filter(x => x).pop()
    name = name.endsWith('.git')?name.slice(0,-4):name
  }
  else {
    name = pkg
  }
  return name
}

const loadPackage = (pkg) => {
  return new Promise((resolve, reject) => {
    const name = packageName(pkg)
    try {
      const loadedPackage = require(packageLocation(name))
      console.log(colors.blue(`'${name}' was already installed since before!`))
      resolve({name: name, package: loadedPackage})
    } catch (err) {
      console.log(colors.yellow(`Couldn't find '${name}' locally, gonna download it now`))
      npmi({name: pkg, path: TRYMODULE_PATH}, (err, result) => {
        if (err) {
          console.log(colors.red(err.message))
          if (err.statusCode === 404) {
            throw new Error(`Could not find package ${name}`)
          }
          if (err.code === npmi.LOAD_ERR) {
            throw new Error('npm load error')
          }
          if (err.code === npmi.INSTALL_ERR) {
            throw new Error('npm install error')
          }
        }
        var realName = result.pop()[0].split('@')[0] // this is the name of the dir where the package is installed
        fs.symlink(realName, packageLocation(name), (err) => {
          const loadedPackage = require(packageLocation(name))
          resolve({name: name, package: loadedPackage})
        })
      })
    }
  })
}

const addPackageToObject = (obj, pkg) => {
  const variable_friendly_package_name = pkg.name.replace(/-|\./g, '_')
  logGreen(`Package '${pkg.name}' was loaded and assigned to '${variable_friendly_package_name}' in the current scope`)
  obj[variable_friendly_package_name] = pkg.package
  return obj
}

if (process.argv[2] === '--clear') {
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
  const packages_to_install = takePackageArguments(process.argv)
  const promises_for_installation = packages_to_install.map((package_name) => loadPackage(package_name))

  Promise.all(promises_for_installation).then((packages) => {
    const context_packages = packages.reduce((context, pkg) => {
      return addPackageToObject(context, pkg)
    }, {})
    console.log('REPL started...')
    if (!process.env.TRYMODULE_NONINTERACTIVE) {
      var replServer = repl.start({
        prompt: '> '
      })
      replHistory(replServer, TRYMODULE_HISTORY_PATH)
      replServer.context = Object.assign(replServer.context, context_packages)
    }
  })
}
