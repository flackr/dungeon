function PriorityQueue() {
  this.data = [];
}

PriorityQueue.prototype = {
  enqueue: function(pri, val) {
    this.data.push([pri, val]);
    this.bubbleUp(this.data.length - 1);
  },

  dequeue: function() {
    if (this.data.length <= 1) {
      return this.data.pop()[1];
    }
    var val = this.data[0][1];
    this.data[0] = this.data.pop();
    this.bubbleDown(0);
    return val;
  },

  length: function() {
    return this.data.length;
  },

  bubbleUp: function(index) {
    while (index > 0) {
      var parentIndex = Math.floor((index - 1) / 2);
      if (this.data[index][0] > this.data[parentIndex][0])
        break;
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  },

  bubbleDown: function(index) {
    while (index * 2 + 1 < this.data.length) {
      var childIndex = index * 2 + 1;
      if (childIndex + 1 < this.data.length &&
          this.data[childIndex + 1][0] < this.data[childIndex][0])
        childIndex++;
      if (this.data[index][0] < this.data[childIndex][0])
        break;
      this.swap(index, childIndex);
      index = childIndex;
    }
  },

  swap: function(i, j) {
    var tmp = this.data[i];
    this.data[i] = this.data[j];
    this.data[j] = tmp;
  },  
};
