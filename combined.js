module.exports = Bin

var Parser = require('binary-parser').Parser
var Serializer = require('./')

const PRIMITIVES = [
  'int8', 'uint8',
  'int16', 'int16be', 'int16le',
  'int32', 'int32be', 'int32le',
  'uint16', 'uint16be', 'uint16le',
  'uint32', 'uint32be', 'uint32le',
  'double', 'doublebe', 'doublele',
  'float', 'floatbe', 'floatle',
]

const BITS = Array.apply(null, Array(24)).map(function(_, i){ return 'bit' + (i + 1) })

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
  .concat(PRIMITIVES)
  .concat(BITS)
  .forEach(function(name){
    Bin.prototype[name] = function(varName, options){
      if(options && options.type instanceof Bin){
        var parserOpts = {__proto__: options, type: options.type.parser}
        var serializerOpts = {__proto__: options, type: options.type.serializer}
      }

      this.parser[name](varName, parserOpts || options)
      this.serializer[name](varName, serializerOpts || options)
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

Bin.prototype.endianess = function(endianess) {
    this.parser.endianess(endianess)
    this.serializer.endianess(endianess)

    return this
}
