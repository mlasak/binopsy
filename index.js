module.exports = Bin

const Parser = require('binary-parser').Parser
const Serializer = require('./lib/serializer.js')

const PRIMITIVE_TYPES = require('./lib/primitive_types.json')
const PRIMITIVES = Object.keys(PRIMITIVE_TYPES).map(function(key){
  return key.toLowerCase()
})

//array with ints 1..24
const BIT_VALS = Array.apply(null, Array(24)).map(function(_, i){ return i + 1 })

function Bin(){
  this.parser = new Parser
  this.serializer = new Serializer

  this.endian = 'be'
  this.bitRequests = []
}

Bin.start = function(){
  return new Bin
}

Bin.Parser = Bin //work as drop-in replacement

Bin.prototype.serialize = function(obj, buf){
  this._flushBitfield()
  return this.serializer.serialize(obj, buf)
}

Bin.prototype.sizeOf = function(obj){
  if(obj == null) return this.parser.sizeOf()
  return this.serializer.sizeFunc(obj)
}

;['string', 'buffer', 'array']
  .concat(PRIMITIVES)
  .forEach(function(name){
    Bin.prototype[name] = function(varName, options){
      this._flushBitfield()

      if(options && options.type instanceof Bin){
        var parserOpts = {__proto__: options, type: options.type.parser}
      }

      this.parser[name](varName, parserOpts || options)
      this.serializer[name](varName, options)
      return this
    }
  })

Bin.prototype.choice = function(varName, options){
  this._flushBitfield()

  var choices = options.choices
  var parserChoices = {}

  for(var key in choices){
    if(typeof choices[key] === "object"){
      parserChoices[key] = choices[key].parser
    } else {
      parserChoices[key] = choices[key]
    }
  }

  this.parser.choice(varName, {__proto__:options, choices: parserChoices})
  this.serializer.choice(varName, options)
  return this
}

Bin.prototype.create = function(constructorFn){
  this.parser.create(constructorFn)
  return this
}

;['getCode', 'compile', 'parse'].forEach(function(name){
  Bin.prototype[name] = function(buffer, callback){
    return this.parser[name](buffer, callback)
  }
})

Object.defineProperty(Bin.prototype, 'writeFunc', {
  get: function(){
    return this.serializer.writeFunc
  }
})

Object.defineProperty(Bin.prototype, 'sizeFunc', {
  get: function(){
    return this.serializer.sizeFunc
  }
})

Bin.prototype.nest = function(varName, options){
  if(options && options.type && options.type.bitRequests && options.type.bitRequests.length){
    this.bitRequests = this.bitRequests.concat(options.type.bitRequests.map(function(req){
      return {
        i: req.i,
        vars: [varName].concat(req.vars)
      }
    }, this))
  }

  this.parser.nest(varName, {__proto__: options, type: options.type.parser})
  this.serializer.nest(varName, options)
  return this
}

BIT_VALS.forEach(function(i){
  Bin.prototype['bit' + i] = function(varName, options){
    this.parser['bit' + i](varName, options)
    this.bitRequests.push({ i: i, vars: [varName]})
    return this
  }
})

Bin.prototype._flushBitfield = function(){
  var reqs = this.bitRequests

  if(!reqs.length) return
  if(this.endian === 'le') reqs = reqs.reverse()

  this.serializer._processBitfield(reqs)

  reqs.length = 0
}

//copied from binary_parser.js
Bin.prototype.endianess = function(endianess) {
  this.parser.endianess(endianess)

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
  .forEach(function(primitiveName){
    var name = primitiveName.slice(0, -2).toLowerCase()

    Bin.prototype[name] = function(varName, options){
      return this[name + this.endian](varName, options)
    }
  })
