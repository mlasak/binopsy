module.exports = Bin

var Parser = require('./binary-parser').Parser
var Serializer = require('./')

//copied from binary_parser.js
const PRIMITIVE_TYPES = {
    'UInt8'    : 1,
    'UInt16LE' : 2,
    'UInt16BE' : 2,
    'UInt32LE' : 4,
    'UInt32BE' : 4,
    'Int8'     : 1,
    'Int16LE'  : 2,
    'Int16BE'  : 2,
    'Int32LE'  : 4,
    'Int32BE'  : 4,
    'FloatLE'  : 4,
    'FloatBE'  : 4,
    'DoubleLE' : 8,
    'DoubleBE' : 8
}

function Bin(){
  this.parser = new Parser
  this.serializer = new Serializer
}

Bin.start = function(){
  return new Bin
}

Bin.Parser = Bin //work as drop-in replacement

Bin.prototype.serialize = function(obj, buf){
  return this.serializer.serialize(obj, buf)
}

Bin.prototype.sizeOf = function(obj){
  if(obj == null) return this.parser.sizeOf()
  return this.serializer.sizeOf(obj)
}

;['string', 'buffer', 'array', 'nest']
  .concat(Object.keys(PRIMITIVE_TYPES).map(Function.prototype.call, String.prototype.toLowerCase))
  //TODO bitfields
  .forEach(function(name){
    Bin.prototype[name] = function(varName, options){
      if(options && options.type instanceof Bin){
        var parserOpts = {__proto__: options, type: options.type.parser}
        var serializerOpts = {__proto__: options, type: options.type.serializer}
      }
      this.parser[name](varName, parserOpts || options)
      this.serializer[name] && this.serializer[name](varName, serializerOpts || options) //TODO
      return this
    }
  })

Bin.prototype.choice = function(varName, options){
  var choices = options.choices
  var parserChoices = {}
  var serializerChoices = {}

  for(var key in choices){
    if(typeof choices[key] === "object"){
      parserChoices[key] = choices[key].parser
      serializerChoices[key] = choices[key].serializer
    } else {
      parserChoices[key] = serializerChoices[key] = choices[key]
    }
  }

  this.parser.choice(varName, {__proto__:options, choices: parserChoices})
  this.serializer.choice(varName, {__proto__:options, choices: serializerChoices})
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

Object.keys(PRIMITIVE_TYPES)
  .filter(RegExp.prototype.test, /BE$/)
  .map(Function.prototype.call, String.prototype.toLocaleLowerCase)
  .forEach(function(primitiveName){
    var name = primitiveName.slice(0, -2).toLowerCase()

    Bin.prototype[name] = function(varName, options){
      return this[name + this.endian](varName, options)
    }
  })

for(var i = 1; i < 25; i++){
  (function(i){
    var name = 'bit' + i
    Bin.prototype[name] = function(varName, options){
      this.parser[name](varName, options)
      //TODO implement in serializer
      return this
    }
  }(i))
}

//copied from binary_parser.js
Bin.prototype.endianess = function(endianess) {
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
