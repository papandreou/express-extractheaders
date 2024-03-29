const Transform = require('stream').Transform;
const util = require('util');

function RangeOmittingStream(omitRanges) {
  // Make a deep copy because we want to manipulate this.omitRanges:
  this.omitRanges = omitRanges.map(function (omitRange) {
    return [].concat(omitRange);
  });
  this.responsePosition = 0;
  this._transform = function (chunk, encoding, callback) {
    let result;
    if (
      this.omitRanges.length > 0 &&
      this.omitRanges[0][0] < chunk.length + this.responsePosition
    ) {
      let chunkOffset = 0;
      const slices = [];
      while (chunkOffset < chunk.length) {
        const omitRange = this.omitRanges[0];
        if (omitRange) {
          const omitIndex = omitRange[0] - this.responsePosition;
          if (omitIndex > 0) {
            slices.push(chunk.slice(chunkOffset, omitIndex));
            chunkOffset = omitIndex;
          }
          if (omitRange[1] <= chunk.length + this.responsePosition) {
            chunkOffset = omitRange[1] - this.responsePosition;
            this.omitRanges.shift();
          } else {
            omitRange[0] = this.responsePosition + chunk.length;
            chunkOffset = chunk.length;
          }
        } else {
          slices.push(chunk.slice(chunkOffset));
          chunkOffset = chunk.length;
        }
      }
      result = Buffer.concat(slices);
    } else {
      result = chunk;
    }
    this.responsePosition += chunk.length;
    callback(null, result);
  };

  Transform.call(this);
}

util.inherits(RangeOmittingStream, Transform);

module.exports = RangeOmittingStream;
