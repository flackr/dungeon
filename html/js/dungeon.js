'use strict';
var offsetX = 150;
var offsetY = 219;
var scale = 97 * 2; // short distance of hex
var scaleLong = scale / 2 * Math.sqrt(3); // long distance of hex

class Dungeon {
  //standardTransform = new Transform(offsetX - scale / 2, offsetY - scaleLong, 0);
  constructor(options) {
    var standardTransform = new Transform(offsetX - scale / 2, offsetY - scaleLong, 0);
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
            new ImageObj("assets/B1b-Earth - D.png", standardTransform, 0, 0),
            new ImageObj("assets/B4b-Natural Stone - D.png", standardTransform, 4, 0),
            new ImageObj("assets/Corridor - Earth 1h.png", standardTransform, 10, 10, 0.45),
    //        new ImageObj("assets/B1b-Earth - D.png", standardTransform, 0, 4),
      //      new ImageObj("assets/B4b-Natural Stone - D.png", standardTransform, 2, 2),
          ],
        }, {
          objects: [
            new Rectangle(10, 10, 50, 50),
            new Crosshair(),
            new ClockTimer(),
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
    this.addToken_ = this.addToken.bind(this);
    this.canvas_.addEventListener('click', this.addToken_);
    this.hexGrid_ = new Layout(Layout.pointy, new Point(112.0, 112.0), new Point(-17, -53));
  }
  addToken(event) {
    var hex = this.hexGrid_.pixelToHex(new Point(event.offsetX, event.offsetY));
    hex.q = Math.round(hex.q);
    hex.r = Math.round(hex.r);
    hex.s = Math.round(hex.s);
    var newToken = new ImageObj("assets/Corridor - Earth 1h.png", null, 0, 0, 0.45);
    newToken.hex = hex;
    this.worlds_[0].layers[2].objects.push(newToken);
  }
  highlight(event) {
    this.context_.save();
    //this.context_.translate(-offsetX/2, -offsetY/2);

    var hex = this.hexGrid_.pixelToHex(new Point(event.offsetX, event.offsetY));
    hex.q = Math.round(hex.q);
    hex.r = Math.round(hex.r);
    hex.s = Math.round(hex.s);
    var corners = this.hexGrid_.polygonCorners(hex);
    this.context_.moveTo(corners[0].x, corners[0].y);
    for (var c = 1; c < 6; c++) {
      this.context_.lineTo(corners[c].x, corners[c].y);
    }
    this.context_.lineTo(corners[0].x, corners[0].y);
    var center = this.hexGrid_.hexToPixel(hex);
    this.context_.font = '50px serif';
    this.context_.fillStyle = "#435a6b";
    this.context_.fillText(
      '(' + hex.q + ',' + hex.r + ',' + hex.s + ')',
      //"XXX",
      corners[0].x, corners[0].y);
//      center.x, center.y);
    this.context_.strokeText(
      '(' + hex.q + ',' + hex.r + ',' + hex.s + ')',
      //"XXX",
      corners[0].x, corners[0].y);//      center.x, center.y);
      this.context_.stroke();
    this.context_.fill();
    this.context_.restore();
    this.worlds_[0].layers[1].objects[2].hex = hex;
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

class Transform {
  constructor(offsetX, offsetY, angleInDegrees) {
    this.offsetX_ = offsetX;
    this.offsetY_ = offsetY;
    this.angleInDegrees_ = angleInDegrees;
  }
  transform(inputX, inputY) {
    var x = inputX - this.offsetX_;
    var y = inputY - this.offsetY_;
    return {
      x: x * Math.cos(this.angleInDegrees_) - y * Math.sin(this.angleInDegrees_),
      y: y * Math.cos(this.angleInDegrees_) + y * Math.sin(this.angleInDegrees_)
    };
  }
}

class ImageObj {
  constructor(url, originTransform, x, y, scale) {
    this.x_ = x;
    this.y_ = y;
    this.scale_ = scale ? scale : 1;
    this.originTransform_ = originTransform;
    this.img = new Image();
    this.img.src = url;
  }

  draw(context, viewport) {
    context.save();
    if (this.hex === undefined) {
      context.translate(-offsetX, -offsetY);
      context.rotate(this.rotation);
      context.translate(offsetX / 2, offsetY / 2);
      context.translate(this.x_ * scale, this.y_ * scaleLong);
    }
    else {
      var location = window.dungeon.hexGrid_.hexToPixel(this.hex);
      context.translate(location.x- 110, location.y - 120);
    }
    context.drawImage(this.img, 0, 0, this.img.width * this.scale_, this.img.height * this.scale_);
    context.restore();
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

class ClockTimer {
  constructor() { }

  draw(context, viewport) {
    context.strokeStyle = 'black';
    context.moveTo(0, 0);
    context.font = '50px serif';
    if (this.time === undefined)
      this.time = new Date();
    context.strokeText(new Date() - this.time, 0.8 * viewport.width, 0.8 * viewport.height);
    context.stroke();
  }
}

document.addEventListener('DOMContentLoaded', function() {
  window.dungeon = new Dungeon({
    canvas: document.getElementById('canvas'),
  });
});