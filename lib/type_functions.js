const PRIMITIVE_TYPES = require('./primitive_types.json')

module.exports = getType

const TYPE_FUNCTIONS = {}

Object.keys(PRIMITIVE_TYPES).forEach(function(key){
  var readKey = 'read' + key
  var writeKey = 'write' + key
  var size = PRIMITIVE_TYPES[key]

  TYPE_FUNCTIONS[key.toLowerCase()] = {
    sizeFunc: function(){
      return size
    },
    writeFunc: function(val, buf){
      return buf[writeKey](val)
    }
  }
})

function getType(type){
  if(typeof type === 'string'){
    if(type in TYPE_FUNCTIONS)
      return TYPE_FUNCTIONS[type]

    throw new Error('unsupported primitive type ' + type)
  } else if(
    typeof type !== 'object' ||
    type === null ||
    typeof type.writeFunc !== 'function'
    typeof type.sizeFunc !== 'function' ||
  ){
    throw new Error('type needs to be either a primitive or a binary parser')
  }

  return type
}
