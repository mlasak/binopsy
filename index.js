module.exports = Serializer

function Serializer(){
  this.sizeOf = function(obj){ return 0 }
  this.writeFunc = function(obj, buf){ return 0 }
  this.vars = new Set()
}

Serializer.prototype.serialize = function(obj, buf){
  if(!Buffer.isBuffer(buf)){
    var size = this.sizeOf(obj)
    buf = new Buffer(size)
  }

  this.writeFunc(obj, buf, 0)

  return buf
}

Serializer.prototype.string = function(varName, options){
  this._addVar(varName)

  var getVar = this._getVarFunc(varName, options)

  var sizeOf = this.sizeOf
  var writeFunc = this.writeFunc

  var encoding = options.encoding || 'utf8'

  if(options.zeroTerminated){
    this.sizeOf = function(obj){
      return getVar(obj).length + 1 + sizeOf(obj)
    }

    this.writeFunc = function(obj, buf){
      var offset = writeFunc(obj, buf);
      var val = getVar(obj)

      return offset + buf.write(val + '\0', offset, val.length + 1, encoding)
    }

    return
  }

  if(options.length){
    var length = options.length

    var getLength = typeof options.length === 'number' ?
                      function(obj){ return length } :
                    typeof options.length === 'string' ?
                      function(obj){ return obj[length] } :
                      function(obj){ return length(obj) }

    this.sizeOf = function(obj){
      return getLength(obj) + sizeOf(obj)
    }

    var fixVal = options.stripNull ?
              function(val, len){
                if(val.length > len) throw new Error('string too long')
                while(val.length < len){
                  val = val + '\0'
                }
                return val
              } : function(val, len){
                //if(val.length !== len) throw new Error('string length doesn\'t match')
                return val
              }

    this.writeFunc = function(obj, buf){
      var offset = writeFunc(obj, buf)
      var len = getLength(obj)
      var val = fixVal(getVar(obj), len)
      return offset + buf.write(val, offset, len, encoding)
    }

    return
  }

  throw new Error('.string needs either a length or a zero-terminated string')
}

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

Object.keys(PRIMITIVE_TYPES).forEach(function(primitiveName){
  var primitiveSize = PRIMITIVE_TYPES[primitiveName]

  Serializer.prototype[primitiveName.toLowerCase()] = function(varName, options){
    this._addVar(varName)

    var getVar = this._getVarFunc(varName, options)

    //add the size of the primitive
    var sizeOf = this.sizeOf
    this.sizeOf = function(obj){
      return primitiveSize + sizeOf(obj)
    }

    var writeFunc = this.writeFunc
    this.writeFunc = function(obj, buf, offset){
      var offset = writeFunc(obj, buf, offset + primitiveSize);
      return offset + buf['write' + primitiveName](getVar(obj), offset)
    }
  }
})

Serializer.prototype._getVarFunc = function(varName, options) {
  if(options && options.formatter && !options.deformatter){
    //TODO throw new Error('formats need to be reversible')
  }

  if(options && options.deformatter){
    var deformatter = options.deformatter
    return function(obj){
      if(!(varName in obj)) throw new Error('var not found')
      return deformatter(obj[varName])
    }
  }

  return function(obj){
    if(!(varName in obj)) throw new Error('var not found')
    return obj[varName]
  }
}

//to ensure getting a value is the same while reading & serializing
Serializer.prototype._addVar = function(varName){
  if(this.vars.has(varName)) throw new Error('duplicated var name')
  this.vars.add(varName)
}
