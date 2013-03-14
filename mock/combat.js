document.addEventListener('DOMContentLoaded', function() {
  new MockGame();
});

function MockGame() {
  this.selected_ = undefined;
  this.characters = [
    {x: 3, y: 3, name: 'Grognak'},
    {x: 9, y: 5, name: 'Luna'},
  ];
  this.canvas_ = document.getElementById('game');
  this.powers_ = document.getElementById('powers');
  this.init();
}

MockGame.prototype.init = function() {
  this.powers_.hidden = true;
  this.pos = [0, 0];
  this.tileSize = 128;
  this.onresize();
  window.addEventListener('resize', this.onresize.bind(this));
  this.canvas_.addEventListener('mousedown', this.onpointerdown.bind(this));
  this.canvas_.addEventListener('touchstart', this.onpointerdown.bind(this));
}

MockGame.prototype.onresize = function() {
  this.canvas_.setAttribute('width', window.innerWidth);
  this.canvas_.setAttribute('height', window.innerHeight);
  this.draw();
}

MockGame.prototype.draw = function() {
  var tw = Math.ceil(this.canvas_.getAttribute('width') / this.tileSize);
  var th = Math.ceil(this.canvas_.getAttribute('width') / this.tileSize);
  var startx = Math.floor(this.pos[1] / this.tileSize);
  var starty = Math.floor(this.pos[0] / this.tileSize);
  var ctx = this.canvas_.getContext('2d');
  var self = this;

  var pointPosition = function(x, y) {
    return [y * self.tileSize - self.pos[0],
            x * self.tileSize - self.pos[1]];
  }
  var drawSquare = function (x, y) {
    ctx.beginPath();
    var square = [pointPosition(x, y),
                  pointPosition(x + 1, y),
                  pointPosition(x + 1, y + 1),
                  pointPosition(x, y + 1)];
    ctx.moveTo(square[0][1], square[0][0]);
    for (var i = 1; i < 4; i++)
      ctx.lineTo(square[i][1], square[i][0]);
    ctx.closePath();
    ctx.stroke();
    var ch = self.characterAt([y, x]);
    if (ch) {
      var center = pointPosition(x + 0.5, y + 0.5);
      ctx.beginPath();
      ctx.arc(center[1], center[0], self.tileSize / 2 - 2, 0, 2*Math.PI);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.fillStyle = 'white';
  ctx.moveTo(0, 0);
  ctx.lineTo(this.canvas_.getAttribute('width'), 0);
  ctx.lineTo(this.canvas_.getAttribute('width'), this.canvas_.getAttribute('height'));
  ctx.lineTo(0, this.canvas_.getAttribute('height'));
  ctx.fill();
  for (var i = starty; i < starty + th; i++) {
    for (var j = startx; j < startx + tw; j++) {
      drawSquare(j, i);
    }
  }
}

MockGame.prototype.characterAt = function(coord) {
  for (var i = 0; i < this.characters.length; i++) {
    if (this.characters[i].x == coord[1] && this.characters[i].y == coord[0])
      return this.characters[i];
  }
}

MockGame.prototype.pxToMap = function(coord) {
  return [Math.floor((coord[0] + this.pos[0]) / this.tileSize), Math.floor((coord[1] + this.pos[1]) / this.tileSize)];
}

MockGame.prototype.addListeners = function(obj, listeners) {
  for (var listen in listeners) {
    obj.addEventListener(listen, listeners[listen]);
  }
}

MockGame.prototype.removeListeners = function(obj, listeners) {
  if (!listeners)
    return;
  for (var listen in listeners) {
    obj.removeEventListener(listen, listeners[listen]);
  }
}

MockGame.prototype.onpointerdown = function(e) {
  this.powers_.hidden = true;
  this.pointer = {
    mode: 'select',
  };
  if (e.type == 'mousedown') {
    this.pointer.maporigin = [this.pos[0], this.pos[1]];
    this.pointer.position = this.pointer.origin = [e.clientY, e.clientX];
    this.pointer.listeners = {
      'mousemove': this.onpointermove.bind(this),
      'mouseup': this.onpointerup.bind(this),
      'mouseout': this.onpointerout.bind(this),
    };
    this.addListeners(this.canvas_, this.pointer.listeners);
  }
  // Select on down event.
  this.selected_ = this.characterAt(this.pxToMap(this.pointer.origin));
}

MockGame.prototype.onpointermove = function(e) {
  if (e.type == 'mousemove') {
    this.pointer.position = [e.clientY, e.clientX];
  }
  if (this.selected_) {
    // Character drag.
    var ctx = this.canvas_.getContext('2d');
    this.draw();
    ctx.beginPath();
    ctx.moveTo(this.pointer.origin[1],this.pointer.origin[0]);
    ctx.lineTo(this.pointer.position[1],this.pointer.position[0]);
    ctx.stroke();
  
  } else {
    // Map drag.
    this.pos[0] = this.pointer.maporigin[0] - this.pointer.position[0] + this.pointer.origin[0];
    this.pos[1] = this.pointer.maporigin[1] - this.pointer.position[1] + this.pointer.origin[1];
    this.draw();
  }
}

MockGame.prototype.onpointerup = function(e) {
  if (this.selected_) {
    var coord = this.pxToMap(this.pointer.position);
    this.selected_.x = coord[1];
    this.selected_.y = coord[0];
    this.powers_.querySelector('.name').textContent = this.selected_.name;
  }
  this.powers_.hidden = !this.selected_;
  this.onpointerout(e);
}

MockGame.prototype.onpointerout = function(e) {
  this.removeListeners(this.canvas_, this.pointer.listeners);
  this.pointer = undefined;
  this.draw();
}
