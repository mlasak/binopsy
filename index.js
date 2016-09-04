'use strict'

module.exports = Bin

const Parser = require('./lib/parser.js')
const Serializer = require('./lib/serializer.js')

const getType = require('./lib/type_functions.js')

const PRIMITIVE_TYPES = require('./lib/primitive_types.json')
const PRIMITIVES = Object.keys(PRIMITIVE_TYPES).map(function (key) {
  return key.toLowerCase()
})

// array with ints 1..24
const BIT_VALS = Array.apply(null, Array(32)).map(function (_, i) { return i + 1 })

function Bin () {
  this.parser = new Parser()
  this.serializer = new Serializer()

  this.endian = 'be'
  this.bitRequests = []
}

Bin.start = function () {
  return new Bin()
}

Bin.Parser = Bin // work as drop-in replacement for binary-parser

Bin.prototype.serialize = function (obj, buf) {
  this._flushBitfield()
  return this.serializer.serialize(obj, buf)
}

Bin.prototype.sizeOf = function (obj) {
  if (obj == null) return this.parser.fixedSize
  return this.serializer.sizeFunc(obj)
}

;['string', 'buffer', 'array', 'fixedSizeNest']
  .concat(PRIMITIVES)
  .forEach(function (name) {
    Bin.prototype[name] = function (varName, options) {
      this._flushBitfield()

      const type = options && options.type && getType(options.type)

      this.parser[name](varName, options, type)
      this.serializer[name](varName, options, type)
      return this
    }
  })

Bin.prototype.choice = function (varName, options) {
  this._flushBitfield()

  const choices = options.choices
  const mappedChoices = {}

  for (var key in choices) {
    mappedChoices[key] = getType(choices[key])
  }

  const defaultChoice = options.defaultChoice && getType(options.defaultChoice)

  const tag = options.tag
  const getTag = typeof tag === 'function' ? tag : function getTag (obj) {
    if (!(tag in obj)) throw new Error('tag `' + tag + '` not found in object')
    return obj[tag]
  }

  var getChoice = defaultChoice
                  ? function (obj) {
                    var key = getTag(obj)
                    return key in mappedChoices ? mappedChoices[key] : defaultChoice
                  }
                  : function (obj) {
                    var choice = mappedChoices[getTag(obj)]
                    if (!choice) throw new Error('invalid choice')
                    return choice
                  }

  this.parser.choice(varName, options, getChoice)
  this.serializer.choice(varName, options, getChoice)
  return this
}

Bin.prototype.create = function (constructorFn) {
  this.parser.create(constructorFn)
  return this
}

Bin.prototype.compile = function () { /* do nothing */ }
Bin.prototype.getCode = function () { throw new Error('not implemented') }

Bin.prototype.parse = function (buffer, callback) {
  this._flushBitfield()
  return this.parser.parse(buffer, callback) || {}
}

Bin.prototype.stream = function () {
  return this.parser.stream()
}

// alias properties
Object.defineProperty(Bin.prototype, 'writeFunc', {
  get: function () {
    return this.serializer.writeFunc
  }
})

Object.defineProperty(Bin.prototype, 'sizeFunc', {
  get: function () {
    return this.serializer.sizeFunc
  }
})

Object.defineProperty(Bin.prototype, 'readFunc', {
  get: function () {
    return this.parser.readFunc
  }
})

Object.defineProperty(Bin.prototype, 'constructorFn', {
  get: function () {
    return this.parser.constructorFn
  }
})

Object.defineProperty(Bin.prototype, 'fixedSize', {
  get: function () {
    return this.parser.fixedSize
  }
})

Bin.prototype.nest = function (varName, options) {
  var type = getType(options.type, true)
  var opts = {__proto__: options, type: type}

  if (type.bitRequests.length) {
    this.bitRequests = this.bitRequests.concat(type.bitRequests.map(function (req) {
      return {
        i: req.i,
        vars: [varName].concat(req.vars),
        options: req.options
        // TODO support constructors
      }
    }, this))
  }

  this.parser.nest(varName, opts)
  this.serializer.nest(varName, opts)
  return this
}

BIT_VALS.forEach(function (i) {
  Bin.prototype['bit' + i] = function (varName, options) {
     // TODO support constructors
    this.bitRequests.push({i: i, vars: [varName], options: options})
    return this
  }
})

Bin.prototype._flushBitfield = function () {
  var reqs = this.bitRequests

  if (!reqs.length) return
  if (this.endian === 'le') reqs = reqs.reverse()

  const length = reqs.reduce(function (sum, req) {
    return sum + req.i
  }, 0)

  this.serializer._processBitfield(reqs, length)
  this.parser.processBitfield(reqs, length)

  this.bitRequests = []
}

// copied from binary_parser.js
Bin.prototype.endianess = function (endianess) {
  switch (endianess.toLowerCase()) {
    case 'little':
      this.endian = 'le'
      break
    case 'big':
      this.endian = 'be'
      break
    default:
      throw new Error('Invalid endianess: ' + endianess)
  }

  return this
}

Object.keys(PRIMITIVE_TYPES)
  .filter(RegExp.prototype.test, /BE$/)
  .map(Function.prototype.call, String.prototype.toLowerCase)
  .forEach(function (primitiveName) {
    var name = primitiveName.slice(0, -2).toLowerCase()

    Bin.prototype[name] = function (varName, options) {
      return this[name + this.endian](varName, options)
    }
  })
