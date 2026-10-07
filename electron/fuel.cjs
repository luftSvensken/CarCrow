// A generic hybrid category does not establish that a car can be charged.
// Only explicit source fuel labels, titles or variants may establish that.
function isPlugInHybrid(...values){
  return values.some(value=>/\b(?:p[\s-]?hev|plug[\s-]?in|laddhybrid|laddbar)\b/i.test(String(value||'')));
}
module.exports={isPlugInHybrid};
