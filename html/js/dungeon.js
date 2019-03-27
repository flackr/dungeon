'use strict';
//import { Layout } from './hexagon.js';
class Dungeon {
  constructor(options) {
    this.options_ = options;
    this.canvas_ = this.options_.canvas;
    this.context_ = this.canvas_.getContext('2d');
    this.worlds_ = [
      {
        layers: [{
          objects: [
       //     new ImageObj("assets/I1b-Man-Made Stone - D.png", 253-55, 730+390-55),
         //   new ImageObj("assets/G1b-Man-Made Stone - D1.png", -55, 390-55),
           // new ImageObj("assets/L1a-Man-Made Stone 1.png", 1612-55, -55),
          ],//G1B, L1A
        }, {
          objects: [
            //new ImageObj('https://drive.google.com/uc?export=download&id=1sovfuNsmMmwgGrJO7T96Xt5cetEX0TGf', 0, 0),
            new ImageObj("assets/B1b-Earth - D.png", -55, -55),
            new ImageObj("assets/B4b-Natural Stone - D.png", 830-55-55, -55),
          ],
        }, {
          objects: [
            new Rectangle(10, 10, 50, 50),
            new Crosshair(),
          ],
        }],
      }
    ];
    this.selectedWorld_ = 0;
    this.tick_ = this.tick.bind(this);
    this.resize_ = this.resize.bind(this);
    this.resize();
    this.tick(performance.now());
    window.addEventListener('resize', this.resize_);
    this.highlight_ = this.highlight.bind(this);
    this.canvas_.addEventListener('mousemove', this.highlight_);
  }
  highlight(event) {
    var hexGrid = new Layout(Layout.pointy, new Point(112.0, 112.0), new Point(0, 0));
    var hex = hexGrid.pixelToHex(new Point(event.offsetX, event.offsetY));
    hex.q = Math.round(hex.q);
    hex.r = Math.round(hex.r);
    hex.s = Math.round(hex.s);
    var corners = hexGrid.polygonCorners(hex);
    this.context_.moveTo(corners[0].x, corners[0].y);
    for (var c = 1; c < 6; c++) {
      this.context_.lineTo(corners[c].x, corners[c].y);
    }
    this.context_.lineTo(corners[0].x, corners[0].y);

  }
  resize() {
    this.canvas_.width = window.innerWidth * window.devicePixelRatio;
    this.canvas_.height = window.innerHeight * window.devicePixelRatio;
    this.canvas_.style.transform = 'scale(' + (1 / window.devicePixelRatio) + ')';
    this.canvas_.style.transformOrigin = 'top left';
    this.draw();
  }

  tick() {
    this.draw();
    requestAnimationFrame(this.tick_);
  }

  draw() {
    let viewport = {x: 0, y: 0, width: this.canvas_.width, height: this.canvas_.height};
    this.context_.clearRect(0, 0, viewport.width, viewport.height);
    let world = this.worlds_[this.selectedWorld_];
    for (let layer of world.layers) {
      for (let object of layer.objects) {
        object.draw(this.context_, viewport);
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

  draw(context, viewport) {
    context.fillStyle = 'green';
    context.fillRect(this.x_, this.y_, this.w_, this.h_);
  }
}

class ImageObj {
  constructor(url, x, y) {
    this.x_ = x;
    this.y_ = y;
    this.img = new Image();
    this.img.src = url;
  }

  draw(context, viewport) {
    context.drawImage(this.img, this.x_, this.y_);
  }
}

class Crosshair {
  constructor() {}

  draw(context, viewport) {
    context.strokeStyle = 'black';
    context.moveTo(0, 0);
    context.lineTo(viewport.width, viewport.height);
    context.moveTo(0, viewport.height);
    context.lineTo(viewport.width, 0);
    context.stroke();
  }
}

document.addEventListener('DOMContentLoaded', function() {
  window.dungeon = new Dungeon({
    canvas: document.getElementById('canvas'),
  });
});