'use strict';
var offsetX = 150;
var offsetY = 219;
var scale = 97; // short distance of hex
var scaleLong = scale / 2 * Math.sqrt(3); // long distance of hex

var renderBoundingBoxes = false;
class EventHandler {
  constructor() {
    this.listeners_ = {};
  }

  dispatchEvent(event) {
    let handled = false;
    let listeners = this.listeners_[event.type];
    for (let listener of listeners || [])
      handled |= listener(event);
    return handled;
  }

  addEventListener(type, fn) {
    (this.listeners_[type] = this.listeners_[type] || []).push(fn);
  }

  removeEventListener(type, fn) {
    let index = (this.listeners_[type] || []).indexOf(fn);
    if (index == -1)
      return;
    this.listeners_[type].splice(index, 1);
  }
}

class GameObject extends EventHandler {
  constructor() {
    super();
    this.x_ = 0;
    this.y_ = 0;
    this.width_ = 0;
    this.height_ = 0;
    this.parent_ = null;
    this.children_ = [];
  }

  root() {
    let rootObject = this;
    while (rootObject.parent_)
      rootObject = rootObject.parent_;
    return rootObject;
  }

  addChild(child) {
    if (child.parent_)
      child.parent_.removeChild(child);
    child.parent_ = this;
    this.children_.push(child);
  }

  removeChild(child) {
    let index = this.children_.indexOf(child);
    if (index == -1) return;
    this.children_.splice(index, 1);
  }

  setBoundingBox(x, y, w, h) {
    this.x_ = x;
    this.y_ = y;
    this.width_ = w;
    this.height_ = h;
  }

  draw(context, viewport) {
    for (let child of this.children_)
      child.draw(context, viewport);
    if (renderBoundingBoxes) {
      context.beginPath();
      context.strokeStyle = 'blue';
      context.rect(this.x_, this.y_, this.width_, this.height_);
      context.stroke();
    }
  }

  hitTest(event){
    return (event.clientX >= this.x_ && event.clientX < this.x_ + this.width_ &&
      event.clientY >= this.y_ && event.clientY < this.y_ + this.height_);
  }
  findTarget(event) {
    for (let i = this.children_.length - 1; i >= 0; i--) {
      let target = this.children_[i].findTarget(event);
      if (target) return target;
    }
    if (this.hitTest(event))
      return this;
    return null;
  }
  dispatchEvent(event) {
    let handled = super.dispatchEvent(event);
    if (!handled && this.parent_)
      handled |= this.parent_.dispatchEvent(event);
    return handled;
  }
}

class Layer extends GameObject {
  constructor(children) {
    super();
    for( let child of children)
      this.addChild(child);
  }
}

class Dungeon extends GameObject {
  constructor(options) {
    super();
    // var standardTransform = new Transform(offsetX - scale / 2, offsetY - scaleLong, 0);
    this.needsRedraw_ = true;
    this.options_ = options;
    this.canvas_ = this.options_.canvas;
    this.context_ = this.canvas_.getContext('2d');
    this.cursor_ = new HexGridCursor();
    let children = [
      new Layer([
            //new ImageObj('https://drive.google.com/uc?export=download&id=1sovfuNsmMmwgGrJO7T96Xt5cetEX0TGf', 0, 0),
            /* This shows a sample image (two adjoining tiles)
            new ImageObj("assets/small.B1b-Earth - D.png", 2*scale - 19, 0*scaleLong - 32,1),
            new ImageObj("assets/small.B4b-Natural Stone - D.png", 6 * scale - 19, 0*scaleLong - 32,1),
            */
        ]),
      new Layer([
        new ImagePalette(0,0,200,500),
        ]),
      new Layer([
           // new Rectangle(10, 10, 50, 50),
           // new Crosshair(),
            new ClockTimer(),
            this.cursor_,
          ]),
    ];
    for(let child of children)
      this.addChild(child);
    this.selectedWorld_ = 0;
    this.tick_ = this.tick.bind(this);
    this.resize_ = this.resize.bind(this);
    this.resize();
    this.tick(performance.now());
    window.addEventListener('resize', this.resize_);
    this.highlight_ = this.highlight.bind(this);
    this.canvas_.addEventListener('mousemove', this.highlight_);
//    this.handleClick_ = this.addToken.bind(this);
  //  this.canvas_.addEventListener('click', this.handleClick_);
    this.activeHandlers_ = [];
    this.canvas_.addEventListener('pointerdown', this.onpointerdown.bind(this));
    this.canvas_.addEventListener('pointermove', this.onpointermove.bind(this));
    this.canvas_.addEventListener('pointerup', this.onpointerup.bind(this));
    for (let eventType of ['touchstart', 'touchmove', 'touchend'])
      this.canvas_.addEventListener(eventType, this.preventDefault);
    this.addEventListener('pointerup', this.handleClick.bind(this));
    this.hexGrid_ = new Layout(Layout.pointy, new Point(56, 56), new Point(8, -1));
  }
  preventDefault(event) {
    event.preventDefault();
  }
  onpointerdown(event) {
    event.preventDefault();
    if (this.activeHandlers_){
      // consider expanding the active handler to make this a multi-touch event.
    }
    let target = this.findTarget(event);
    let events = {}
    events[event.pointerId] = event;
    this.activeHandlers_[event.pointerId] = {events, target};
    target.dispatchEvent(event);
    ////console.log('down', target);
  }
  onpointermove(event) {
    event.preventDefault();
    let captureHandler = this.activeHandlers_[event.pointerId];
    if (captureHandler) {
      captureHandler.events[event.pointerId] = event;
      captureHandler.target.dispatchEvent(event);
      //console.log('move', captureHandler.target);
      return;
    }    
    let target = this.findTarget(event);
    target.dispatchEvent(event);
  }
  onpointerup(event){
    event.preventDefault();
    let captureHandler = this.activeHandlers_[event.pointerId];
    if (captureHandler) {
      captureHandler.target.dispatchEvent(event);
      //console.log('up', captureHandler.target);
      delete captureHandler.events[event.pointerId];
      for (let key in captureHandler.events)
        return;
      delete this.activeHandlers_[event.pointerId];
      return;
    }
  }
  handleClick(event) {
    var newToken = new HexObject("assets/small.Corridor - Earth 1h.png", 0, 0, 0.45);
    newToken.setPosition(this.hexGrid_.pixelToHex(
      new Point(event.offsetX/window.devicePixelRatio, 
        event.offsetY/window.devicePixelRatio)).round());
    this.children_[0].addChild(newToken);
    return true;
  }
  highlight(event) {
    this.cursor_.setPosition(
      this.hexGrid_.pixelToHex( new Point(event.offsetX/window.devicePixelRatio, 
        event.offsetY/window.devicePixelRatio)).round());

  }
  resize() {
    this.canvas_.width = window.innerWidth * window.devicePixelRatio;
    this.canvas_.height = window.innerHeight * window.devicePixelRatio;
    this.canvas_.style.transform = 'scale(' + (1 / window.devicePixelRatio) + ')';
    this.canvas_.style.transformOrigin = 'top left';
    this.context_.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.setBoundingBox(0, 0, window.innerWidth, window.innerHeight);
    this.draw();
  }

  tick() {
    this.needsRedraw_ = false;
    this.draw();
  }

  draw() {
    let viewport = {x: 0, y: 0, width: this.canvas_.width, height: this.canvas_.height};
    this.context_.clearRect(0, 0, viewport.width, viewport.height);
    super.draw(this.context_, viewport);
  }

  setNeedsRedraw() {
    if (this.needsRedraw_)
      return;
    this.needsRedraw_ = true;
    requestAnimationFrame(this.tick_);
  }
}

class HexGridCursor extends GameObject {
  constructor() {
    super();
    this.hex_ = null;
  }
  draw( context, viewport){
    if (!this.hex_)
      return;
    var corners = dungeon.hexGrid_.polygonCorners(this.hex_);
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    for (var c = 1; c < 6; c++) {
      context.lineTo(corners[c].x, corners[c].y);
    }
    context.lineTo(corners[0].x, corners[0].y);
    context.stroke();
  }
  setPosition(hex) {
    if (!hex.equals(this.hex_)) {
      this.hex_ = hex;
      dungeon.setNeedsRedraw();
    }
  }
}

// Adds a click handler to the given target, calling it whenever the object is clicked
class ClickHandler {
  constructor(target) {
    this.target_ = target;
    this.target_.clickHandler = this;
    this.target_.addEventListener('pointerdown', this.pointerdown.bind(this));
    this.pointerup_ = this.pointerup.bind(this)
    this.pointermove_ = this.pointermove.bind(this)
  }
  pointerdown(event) {
    let result = true;
    if (this.target_.pointerdown)
      result = this.target_.pointerdown(event);

    this.target_.addEventListener('pointerup', this.pointerup_);
    this.target_.addEventListener('pointermove', this.pointermove_);
    return result;
  }
  pointermove(event) {
    let result = true;
    if (this.target_.pointermove)
      result = this.target_.pointermove(event);
    return result;
  }
  pointerup(event) {
    let result = true;
    if (this.target_.pointerup)
      result = this.target_.pointerup(event);
    this.target_.removeEventListener('pointermove', this.pointermove_);
    this.target_.removeEventListener('pointerup', this.pointerup_);
    return result;
  }
}

class ImagePalette extends GameObject {
  constructor(x, y, w, h) {
    super();
    this.x_ = x;
    this.y_ = y;
    this.w_ = w;
    this.h_ = h;
    this.menu_scale_ = 0.2;
    this.resizeObserver_ = new ResizeObserver( entry => {
      let current = 0;
      for (let child of this.children_) {
        child.x_ = this.x_ + current;
        current += child.height_ + 5;
      }});

    //this.addImage("assets/small.B1b-Earth - D.png");
    //this.addImage("assets/small.B4b-Natural Stone - D.png");
    let children = [
      new Layer([
        //new ImageObj('https://drive.google.com/uc?export=download&id=1sovfuNsmMmwgGrJO7T96Xt5cetEX0TGf', 0, 0),
        new ImageObj("assets/small.B1b-Earth - D.png", (0 * scale - 19) * this.menu_scale_, (0 * scaleLong - 32) * this.menu_scale_, this.menu_scale_),
        new ImageObj("assets/small.B4b-Natural Stone - D.png", (0 * scale - 19) * this.menu_scale_, (5 * scaleLong - 32) * this.menu_scale_, this.menu_scale_),
      ]),
    ];
    for (let child of children)
      this.addChild(child);
  }

  addImage(name) {
    let image = new ImageObj(name, 0, this.next_, this.menu_scale_);
    // image won't be loaded yet.... need to tap into ResizeObserver
    this.addChild(image);
///////// not a valid object. need to wire up an observer: https://www.dofactory.com/javascript/observer-design-pattern
//    this.resizeObserver_.observe(image);
  }

  draw(context, viewport) {
    context.fillStyle = 'white';
    context.fillRect(this.x_, this.y_, this.w_, this.h_);
    super.draw(context, viewport);
    //for (let child of this.children)
      //child.draw(context,viewport);
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

class ImageObj extends GameObject {
  constructor(url, x, y, scale) {
    super();
    this.setBoundingBox(x, y, 0, 0);
    this.scale_ = scale ? scale : 1;
    this.img = null;
    cache.getImage(url).then(this.onload.bind(this));
  }
  onload(img) {
    this.img = img;
    this.setBoundingBox(this.x_, this.y_, img.width * this.scale_, img.height * this.scale_);
    dungeon.setNeedsRedraw();
  }
  
  draw(context, viewport) {
    if (!this.img)
      return;
    context.drawImage(this.img, this.x_, this.y_, this.width_, this.height_);
    context.save();
    super.draw(context, viewport);
  }
}

let num = 0;
class HexObject extends ImageObj {
  constructor(url, x, y, scale) {
    super(url, x, y, scale);
    this.name = 'hex' + num++;
    new ClickHandler(this);
  }
  setPosition(hex) {
    if (!hex.equals(this.hex_)) {
      this.hex_ = hex;
      var location = window.dungeon.hexGrid_.hexToPixel(this.hex_);
      this.setBoundingBox(location.x- 55, location.y - 60, this.width_, this.height_);
      dungeon.setNeedsRedraw();
    }
  }
  pointermove(event) {
    this.setPosition(
      dungeon.hexGrid_.pixelToHex(new Point(event.offsetX/window.devicePixelRatio, 
        event.offsetY/window.devicePixelRatio)).round());
    return true;
  }

  pointerup(event) {
    this.setPosition(
      dungeon.hexGrid_.pixelToHex(new Point(event.offsetX/window.devicePixelRatio,
        event.offsetY/window.devicePixelRatio)).round());
    return true;
  }
}

class ImageCache {
  constructor() {
    this.cachedImages = {};
  }

  getImage(url) {
    if (!this.cachedImages[url]) {
      this.cachedImages[url] = new Promise((resolve, reject) => {
        let i = new Image();
        i.src = url;
        i.onload = () => { resolve(i); };
      });
    }
    return this.cachedImages[url];
  }
}

class Crosshair extends GameObject {
  constructor() {
    super();
  }

  draw(context, viewport) {
    context.beginPath();
    context.strokeStyle = 'black';
    context.moveTo(this.x_, this.y_);
    context.lineTo(this.x_ + this.width_, this.y_ + this.height_);
    context.moveTo(this.x_, this.y_ + this.height_);
    context.lineTo(this.x_ + this.width_, this.y_);
    context.stroke();
    super.draw(context, viewport);
  }
}

class ClockTimer extends GameObject {
  constructor() {
    super();
    this.drawCount_ = 0;
  }

  draw(context, viewport) {
    context.strokeStyle = 'black';
    context.font = '50px serif';
    context.strokeText(++this.drawCount_, 0.8 * window.innerWidth, 0.8 * window.innerHeight);
  }
}

class ObjectPalette extends GameObject {
}

document.addEventListener('DOMContentLoaded', function() {
  window.cache = new ImageCache();
  window.dungeon = new Dungeon({
    canvas: document.getElementById('canvas'),
  });
});