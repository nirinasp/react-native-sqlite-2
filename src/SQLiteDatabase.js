import map from 'lodash.map'
import SQLiteResult from './SQLiteResult'
import zipObject from 'lodash.zipobject'
import { NativeModules, Platform } from 'react-native'
const { RNSqlite2 } = NativeModules

const os = Platform.OS

function massageError(err) {
  return typeof err === 'string' ? new Error(err) : err
}

function SQLiteDatabase(name) {
  this._name = name
}

function dearrayifyRow(res) {
  // use a compressed array format to send minimal data between
  // native and web layers
  var rawError = res[0]
  if (rawError) {
    return new SQLiteResult(massageError(res[0]))
  }
  var insertId = res[1]
  if (insertId === null) {
    insertId = void 0 // per the spec, should be undefined
  }
  var rowsAffected = res[2]
  var columns = res[3]
  var rows = unescapeMacIOSAndroid(res[4] || [])
  var zippedRows = []
  for (var i = 0, len = rows.length; i < len; i++) {
    zippedRows.push(zipObject(columns, rows[i]))
  }

  // v8 likes predictable objects
  return new SQLiteResult(null, insertId, rowsAffected, zippedRows)
}

// send less data over the wire, use an array
function arrayifyQuery(query) {
  return [query.sql, escapeMacIOSAndroid(query.args || [])]
}

// for avoiding strings truncated with '\u0000'
function escapeMacIOSAndroid(args) {
  if (os === 'android' || os === 'ios' || os === 'macos') {
    return map(args, escapeBlob)
  } else {
    return args
  }
}

function escapeBlob(data) {
  if (typeof data === 'string') {
    return data
      .replace(/\u0002/g, '\u0002\u0002')
      .replace(/\u0001/g, '\u0001\u0002')
      .replace(/\u0000/g, '\u0001\u0001')
  } else {
    return data
  }
}

function unescapeMacIOSAndroid(rows) {
  if (os === 'android' || os === 'ios' || os === 'macos') {
    return map(rows, function (row) {
      return map(row, unescapeBlob)
    })
  } else {
    return rows
  }
}

function unescapeBlob(data) {
  if (typeof data === 'string') {
    return data
      .replace(/\u0001\u0001/g, '\u0000')
      .replace(/\u0001\u0002/g, '\u0001')
      .replace(/\u0002\u0002/g, '\u0002')
  } else {
    return data
  }
}

SQLiteDatabase.prototype.exec = function exec(queries, readOnly, callback) {
  function onSuccess(rawResults) {
    var parsedResults = typeof rawResults == 'string' 
      ? JSON.parse(rawResults) 
      : rawResults
    var results = map(parsedResults, dearrayifyRow)
    callback(null, results)
  }

  function onError(err) {
    callback(massageError(err))
  }

  RNSqlite2.exec(this._name, map(queries, arrayifyQuery), readOnly).then(
    onSuccess,
    onError
  )
}

export default SQLiteDatabase
