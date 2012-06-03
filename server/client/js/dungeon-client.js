dungeon.Client = function() {
  this.initialize();
}

dungeon.Client.prototype = extend(dungeon.Game.prototype, {
  initialize: function() {
    dungeon.Game.prototype.initialize.call(this);

    this.ui = {
      selected: undefined,
    };

    this.characterList = {};
    this.viewport = {
      x: 30,
      y: 30,
      tileSize: 32,
    };

    // Events can be sent faster than they can be processed. To avoid dropping
    // important events, such as file load, we can compare against this index
    // to detect a stall, and requeue the event if needed.
    this.lastEventIndex = -1;

    this.canvas = $('game-canvas');
    this.socket = io.connect('http://' + location.host);

    this.socket.on('e', this.receiveEvent.bind(this));
    this.canvas.addEventListener('mousedown', this.onPointerDown.bind(this));

    // Switching between views.
    $('character-selector').addEventListener('click', this.onSelectView.bind(this,'character'));
    $('map-selector').addEventListener('click', this.onSelectView.bind(this,'map'));
    $('combat-overview-selector').addEventListener(
        'click', 
        this.onSelectView.bind(this,'combat-overview'));

    // Drag-n-drop of character files.
    var dropZone = $('sidebar-character-list');
    dropZone.addEventListener('dragover', this.onDragOver.bind(this));
    dropZone.addEventListener('drop', this.onDrop.bind(this));
    // Character file chooser
    $('files').addEventListener('change', this.onFileSelect.bind(this));

    // TODO(kellis): Drag-n-drop of a character from the sidebar onto the map.

    window.addEventListener('resize', this.resize.bind(this));
    this.resize();
  },

  resize: function() {
    var element = $('content-area');
    this.canvas.setAttribute('width', element.clientWidth);
    this.canvas.setAttribute('height', element.clientHeight);

    // Hack to fix scrolling of the character page.
    $('character-page').style.setProperty('height', element.clientHeight + 'px');

    this.update();
  },

  /**
   * Broadcasts an event, which will be processed by all clients.
   * @param {json} eventData Raw data in JSON format describing the event.
   * @param {boolean=} opt_force Set to true to mark an important event which
   *     should be requeued if a previous event is still being processed.
   */
  sendEvent: function(eventData, opt_force) {
    if(this.lastEventIndex < this.events.length) {
      this.lastEventIndex = this.events.length;
      this.socket.emit('e', this.events.length, eventData);
    } else if (opt_force) {
      // Last event has not been processed.  Requeue the event.
      var self = this;
      var queueEvent = (function(e) {
        return function() {
          self.sendEvent(e, true);
        }
      })(eventData);
      window.setTimeout(queueEvent, 100);
    }
  },

  receiveEvent: function(eventData) {
    // TODO(flackr): processEvent can return false if the event description is
    // not possible to execute given the current game state. If this happens it
    // is likely that the game state is incorrect.
    this.processEvent(eventData);
  },

  onSelectView: function(view) {
    var selectors = document.getElementsByClassName('page-selector');
    for (var i = 0; i < selectors.length; i++)
      selectors[i].setAttribute('active', false);
    var pages = document.getElementsByClassName('page');
    for (var i = 0; i < pages.length; i++) {
      pages[i].hidden = true;
      console.log('hide ' + pages[i].id);
    }
    $(view + '-selector').setAttribute('active', true);
    $(view + '-page').hidden = false;
  },

  onPointerDown: function(e) {
    e.preventDefault();
    this.pointer = {
      x1: e.clientX,
      y1: e.clientY,
      listeners: {
        mouseup: this.onPointerUp.bind(this),
        mouseout: this.onPointerOut.bind(this),
        mousemove: this.onPointerMove.bind(this)},
      mapX: this.viewport.x,
      mapY: this.viewport.y};
    for (var i in this.pointer.listeners)
      this.canvas.addEventListener(i, this.pointer.listeners[i]);
  },

  onPointerMove: function(e) {
    var deltaX = e.clientX - this.pointer.x1;
    var deltaY = e.clientY - this.pointer.y1;
    var dragThreshold = 10;
    if (this.pointer.dragStarted || Math.abs(deltaX) + Math.abs(deltaY) > dragThreshold) {
      this.pointer.dragStarted = true;
      this.viewport.x = (this.pointer.mapX - deltaX / this.viewport.tileSize);
      this.viewport.y = (this.pointer.mapY - deltaY / this.viewport.tileSize);
      this.update();
    }
  },

  onPointerOut: function(e) {
    for (var i in this.pointer.listeners)
      this.canvas.removeEventListener(i, this.pointer.listeners[i]);
    this.pointer = null;
  },

  onPointerUp: function(e) {
    for (var i in this.pointer.listeners)
      this.canvas.removeEventListener(i, this.pointer.listeners[i]);
    if (this.pointer.dragStarted) {
      this.pointer = null;
      return;
    }
    this.pointer = null;
    var x = e.clientX;
    var y = e.clientY;
    var element = this.canvas;
    while (element != document.body) {
      x -= element.offsetLeft;
      y -= element.offsetTop;
      element = element.parentNode;
    }
    var w = parseInt(this.canvas.getAttribute('width'));
    var h = parseInt(this.canvas.getAttribute('height'));
    var evt = {
      x: Math.floor((x - w/2)/this.viewport.tileSize + this.viewport.x),
      y: Math.floor((y - h/2)/this.viewport.tileSize + this.viewport.y)
    };

    if (evt.x < 0 || evt.y < 0 || evt.x >= this.map[0].length || evt.y >= this.map.length)
      return;
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

  onDragOver: function(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  },

  onDrop: function(e) {
    var files = e.dataTransfer.files;
    this.loadFiles(files);
  },

  onFileSelect: function(e) {
    var files = e.target.files;
    this.loadFiles(files);
  },

  /**
   * Loads one or more files.  This is the entry point for all file types.
   * Currently only D&D player files (dnd4e extension) are handled.  More to
   * follow.
   * @param {File|FileList} file File or list of files to load.
   */
  loadFiles: function(file) {
    if (file) {
      if (file instanceof FileList) {
        for (var i = 0; i < file.length; i++)
          this.loadFiles(file[i]);
      } else {
        var filename = file.name;
        var reader = new FileReader();
        var self = this;
        reader.onload = function(evt) {
          var xmlContent = evt.target.result;
          var json = dungeon.ParseCharacter(filename, xmlContent);
          var evt = {
            type: 'add-character',
            character: json
          };
          self.sendEvent(evt, true);
        }
        reader.readAsText(file);
      }
    }
  },

  update: function() {
    var ctx = this.canvas.getContext('2d');
    var w = parseInt(this.canvas.getAttribute('width'));
    var h = parseInt(this.canvas.getAttribute('height'));
    var view = {
      x1: Math.max(0, Math.floor(this.viewport.x - w / this.viewport.tileSize / 2)),
      y1: Math.max(0, Math.floor(this.viewport.y - h / this.viewport.tileSize / 2)),
      x2: Math.min(this.map[0].length, Math.ceil(this.viewport.x + w / this.viewport.tileSize / 2)),
      y2: Math.min(this.map.length, Math.ceil(this.viewport.y + h / this.viewport.tileSize / 2)),
    };
    var baseX = Math.floor(w / 2 - (this.viewport.x - view.x1) * this.viewport.tileSize);
    var baseY = Math.floor(h / 2 - (this.viewport.y - view.y1) * this.viewport.tileSize);

    // Draw a black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    for (var i = view.y1; i < view.y2; i++) {
      for (var j = view.x1; j < view.x2; j++) {
        ctx.fillStyle = this.map[i][j] ? '#000' : '#ccc';
        ctx.fillRect(baseX + (j - view.x1) * this.viewport.tileSize,
                     baseY + (i - view.y1) * this.viewport.tileSize,
                     this.viewport.tileSize, this.viewport.tileSize);
      }
    }
    ctx.font = (this.viewport.tileSize - 5) + 'px Arial';
    for (var i = 0; i < this.characters.length; i++) {
      var character = this.characters[i];
      var name = character.name;
      // Update in character list.
      if (name in this.characterList)
         this.updateCharacter(character);
      else
         this.addCharacter(character);
      // Show on map only if position has been set.
      if (character.x == undefined)
        continue;
      ctx.fillStyle = '#f00';
      ctx.fillText(name,
                   baseX + (character.x - view.x1) * this.viewport.tileSize,
                   baseY + ((character.y + 1) - view.y1) * this.viewport.tileSize);
    }

  },

  addCharacter: function(characterData) {
    var element = dungeon.CharacterButton(characterData);
    this.characterList[characterData.name] = element;
    $('sidebar-character-list').appendChild(element);
  },

  updateCharacter: function(characterData) {
     //TODO(kellis): Implement me.
  },

});

document.addEventListener('DOMContentLoaded', function() {
  new dungeon.Client();
});
