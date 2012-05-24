dungeon.Client = function() {
  this.initialize();
}

dungeon.Client.prototype = extend(dungeon.Game.prototype, {
  initialize: function() {
    dungeon.Game.prototype.initialize.call(this);

    this.ui = {
      selected: undefined,
    };

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
      x: Math.floor((e.clientX - this.canvas.offsetLeft) / this.blockSize),
      y: Math.floor((e.clientY - this.canvas.offsetTop) / this.blockSize),
    };

    if (this.ui.selected !== undefined) {
      evt.type = 'move';
      evt.index = this.ui.selected;
      this.ui.selected = undefined;
      this.sendEvent(evt);
      return;
    }
    for (var i = 0; i < this.characters.length; i++) {
      if (this.characters[i].x == evt.x && this.characters[i].y == evt.y) {
        this.ui.selected = i;
        return;
      }
    }
    if (this.map.length > evt.y && this.map[evt.y].length > evt.x) {
      evt.type = 'change';
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
    ctx.font = (this.blockSize - 5) + 'px Arial';
    for (var i = 0; i < this.characters.length; i++) {
      ctx.fillStyle = '#f00';
      ctx.fillText(this.characters[i].name, this.characters[i].x * this.blockSize, (this.characters[i].y + 1) * this.blockSize);
    }
  },
});

document.addEventListener('DOMContentLoaded', function() {
  new dungeon.Client();
});
