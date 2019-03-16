'use strict';

class Dungeon {
  constructor(options) {
    this.options_ = options;
    this.worlds_ = [
      {
        layers: [{
          objects: [
            new Rectangle(10, 10, 50, 50),
            new Crosshair(),
          ]
        }]
      }
    ];
    this.selectedWorld_ = 0;
  }

  draw(timestamp, context, viewport) {
    context.clearRect(0, 0, viewport.width, viewport.height);
    let world = this.worlds_[this.selectedWorld_];
    for (let layer of world.layers) {
      for (let object of layer.objects) {
        object.draw(timestamp, context, viewport);
      }
    }
  }
}

class Rectangle {
  constructor(x, y, w, h) {
    this.x_ = x;
    this.y_ = y;
    this.w_ = w;
    this.h_ = h;
  }

  draw(timestamp, context, viewport) {
    context.fillStyle = 'green';
    context.fillRect(this.x_, this.y_, this.w_, this.h_);
  }
}

class Crosshair {
  constructor() {}

  draw(timestamp, context, viewport) {
    context.strokeStyle = 'black';
    context.moveTo(0, 0);
    context.lineTo(viewport.width, viewport.height);
    context.moveTo(0, viewport.height);
    context.lineTo(viewport.width, 0);
    context.stroke();
  }
}

window.dungeon = new Dungeon();
