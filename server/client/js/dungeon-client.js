dungeon.Client = function() {
  this.initialize();
}

dungeon.Client.prototype = extend(dungeon.Game.prototype, {
  initialize: function() {
    dungeon.Game.prototype.initialize.call(this);

    this.canvas = $('game-canvas');
    this.blockSize = 32;
    this.socket = io.connect('http://' + location.host);

    this.socket.on('e', this.receiveEvent.bind(this));
    this.canvas.addEventListener('click', this.onClick.bind(this));
  },

  sendEvent: function(eventData) {
    this.socket.emit('e', this.events.length, eventData);
  },

  receiveEvent: function(eventData) {
    // TODO(flackr): processEvent can return false if the event description is
    // not possible to execute given the current game state. If this happens it
    // is likely that the game state is incorrect.
    this.processEvent(eventData);
  },

  onClick: function(e) {
    var evt = {
      type: 'change',
      x: Math.floor((e.clientX - this.canvas.offsetLeft) / this.blockSize),
      y: Math.floor((e.clientY - this.canvas.offsetTop) / this.blockSize),
    };
    if (this.map.length > evt.y && this.map[evt.y].length > evt.x) {
      evt.value = !this.map[evt.y][evt.x];
      this.sendEvent(evt);
    }
  },

  update: function() {
    var ctx = this.canvas.getContext('2d');
    for (var i = 0; i < this.map.length; i++) {
      for (var j = 0; j < this.map[i].length; j++) {
        ctx.fillStyle = this.map[i][j] ? '#000' : '#ccc';
        ctx.fillRect(j * this.blockSize, i * this.blockSize, this.blockSize,
            this.blockSize);
      }
    }
	for (var i = 0; i < this.characters.length; i++) {
        ctx.fillStyle = '#f00';
        ctx.fillText(this.characters[i].name, this.characters[i].x * this.blockSize, this.characters[i].y * this.blockSize);
      }
  },
});

document.addEventListener('DOMContentLoaded', function() {
  new dungeon.Client();
});
