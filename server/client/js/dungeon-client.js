dungeon.Client = function() {
  dungeon.Game.apply(this);
  this.initialize();
}

dungeon.Client.prototype = extend(dungeon.Game.prototype, {
  initialize: function() {
    var role = 'player';
    if (window.location.hash == '#dm')
      role = 'dm';
    document.body.parentNode.setAttribute('role', role);

    this.canvas = $('game-canvas');
    this.socket = io.connect('http://' + location.host);

    this.socket.on('e', this.receiveEvent.bind(this));
    this.canvas.addEventListener('mousedown', this.onPointerDown.bind(this));

    // Switching between views.
    $('character-selector').addEventListener(
        'click', this.onSelectView.bind(this, 'page', 'character'));
    $('map-selector').addEventListener(
        'click', this.onSelectView.bind(this,'page', 'map'));
    $('combat-overview-selector').addEventListener(
        'click', this.onSelectView.bind(this,'page', 'combat-overview'));
    $('character-import-selector').addEventListener(
        'click', this.onSelectView.bind(this, 'sidebar-page', 'character-import'));
    $('combat-tracker-selector').addEventListener(
        'click', this.onSelectView.bind(this, 'sidebar-page', 'combat-tracker'));

    $('undo-button').addEventListener('click', this.sendEvent.bind(this, {'type': 'undo'}));
    $('save-button').addEventListener('click', this.saveMap.bind(this));

    // Drag-n-drop of character files.
    var dropZone = $('sidebar-character-list');
    dropZone.addEventListener('dragover', this.onFileDragOver.bind(this));
    dropZone.addEventListener('drop', this.onFileDrop.bind(this));
    // Character file chooser
    $('files').addEventListener('change', this.onFileSelect.bind(this));

    // Drag-n-drop of a character from the sidebar onto the map.
    this.canvas.addEventListener('dragover', this.onCharacterDragOver.bind(this));
    this.canvas.addEventListener('drop', this.onCharacterDrop.bind(this));

    // Drag-n-drop of image files for map tiles.
    dropZone = $('map-tiles');
    dropZone.addEventListener('dragover', this.onFileDragOver.bind(this));
    dropZone.addEventListener('drop', this.onMapTileDrop.bind(this));

    window.addEventListener('resize', this.resize.bind(this));
    this.addEventListener('tile-added', this.rebuildTiles.bind(this));
    this.addEventListener('character-loaded', this.updateCharacterRegistry.bind(this));
    this.addEventListener('log', function(text) {
      $('combat-message-area').textContent += text;
    });

    this.viewport = {
      x: 30,
      y: 30,
      tileSize: 32,
    };

    dungeon.Game.prototype.initialize.call(this);
    this.resize();
  },

  reset: function() {
    dungeon.Game.prototype.reset.call(this);

    this.ui = {
      selected: undefined,
      mapImages: [],
    };

    this.characterList = {};

    // Map related.
    this.rebuildTiles();
  },

  resize: function() {
    var element = this.canvas.parentNode;
    this.canvas.setAttribute('width', element.clientWidth);
    this.canvas.setAttribute('height', element.clientHeight);
    this.update();
  },

  /**
   * Broadcasts an event, which will be processed by all clients.
   * @param {json} eventData Raw data in JSON format describing the event.
   * @param {boolean=} opt_force Set to true to mark an important event which
   *     should be requeued if a previous event is still being processed.
   */
  sendEvent: function(eventData, opt_force) {
    this.socket.emit('e', this.events.length, eventData);
  },

  receiveEvent: function(eventData) {
    // TODO(flackr): processEvent can return false if the event description is
    // not possible to execute given the current game state. If this happens it
    // is likely that the game state is incorrect.
    if (this.processEvent(eventData))
      this.update();
  },

  onSelectView: function(category, view) {
    var selectors = document.getElementsByClassName(category + '-selector');
    for (var i = 0; i < selectors.length; i++)
      selectors[i].setAttribute('active', false);
    var pages = document.getElementsByClassName(category);
    for (var i = 0; i < pages.length; i++) {
      pages[i].hidden = true;
    }
    $(view + '-selector').setAttribute('active', true);
    $(view + '-page').hidden = false;

    if (view == 'combat-tracker')
      this.onSelectView('page', 'map');
  },

  onPointerDown: function(e) {
    var selectedTile = dungeon.MapEditor.selectedTile();
    e.preventDefault();
    if (selectedTile == -1) {
      this.pointer = {
        mode: 'select',
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
    } else {
      var lastpos = this.computeMapCoordinates(e);

      var self = this;
      var paint = function(pos) {
        if (self.map.length > pos.y && self.map[pos.y].length > pos.x) {
          pos.type = 'change';
          pos.value = selectedTile;
          self.sendEvent(pos);
        }
      };

      paint(lastpos);
      var move = function move(e) {
        var pos = self.computeMapCoordinates(e);
        if (pos.y == lastpos.y && pos.x == lastpos.x)
          return;
        lastpos = pos;
        paint(pos);
      };

      var cancel = function() {
        self.canvas.removeEventListener('mousemove', move);
        self.canvas.removeEventListener('mouseup', cancel);
        self.canvas.removeEventListener('mouseout', cancel);
      };
      this.canvas.addEventListener('mousemove', move);
      this.canvas.addEventListener('mouseup', cancel);
      this.canvas.addEventListener('mouseout', cancel);
    }
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
    var evt = this.computeMapCoordinates(e);
    if (evt.x < 0 || evt.y < 0 || evt.x >= this.map[0].length || evt.y >= this.map.length)
      return;
    for (var i = 0; i < this.characterPlacement.length; i++) {
      if (this.characterPlacement[i].x == evt.x && this.characterPlacement[i].y == evt.y) {
        var power;
        if (this.ui.selected !== undefined &&
            (power = dungeon.combatTracker.selectedPower())) {
          // Deselect power to indicate action was completed.
          dungeon.combatTracker.selectPower();
          this.attack(this.ui.selected, i, power);
        } else {
          this.ui.selected = i;
          dungeon.combatTracker.dispatchEvent('character-selected', this.characterPlacement[i]);
        }
        return;
      }
    }
    if (this.ui.selected !== undefined) {
      evt.type = 'move';
      evt.index = this.ui.selected;
      this.ui.selected = undefined;
      this.sendEvent(evt);
      return;
    }
  },

  attack: function(attacker, attackee, power) {
    var toHitStr = '1d20 + ' + power.toHit;
    var dmgStr = power.damage;
    var logStr = 'Rolling attack: ' + toHitStr + '\n';
    var attack = this.rollDice(this.parseRollString(toHitStr));
    logStr += attack[1] + '\n';
    logStr += 'Rolling damage: ' + dmgStr + '\n';
    var damage = this.rollDice(this.parseRollString(dmgStr));
    logStr += damage[1] + '\n';
    this.attackResult(attacker, attackee, power, attack[0], damage[0], logStr);
  },

  attackResult: function(attacker, attackee, power, tohit, dmg, logStr) {
    var attackedStat = power.defense;
    var defStat = parseInt(
        this.characterPlacement[attackee].source.stats[attackedStat]);
    if (defStat <= tohit) {
      logStr += 'HIT for ' + dmg + '\n';
      this.sendEvent({
        type: 'attack-result',
        characters: [
          [attackee,
           {'Hit Points':
           this.characterPlacement[attackee].condition.stats['Hit Points']
               - dmg}],
        ],
        log: logStr,
      });
    } else {
      logStr += 'Missed!' + '\n';
      this.sendEvent({type: 'log', text: logStr});
    }
  },

  rollDice: function(rollArray) {
    var total = 0;
    var rollstr = '';
    // Rolls the given dice.
    for (var i = 0; i < rollArray.length; i++) {
      var val = rollArray[i][1];
      if (rollArray[i][0] > 0) {
        val = 0;
        for (var j = 0; j < rollArray[i][0]; j++) {
          val += Math.floor(Math.random() * rollArray[i][1] + 1);
        }
      }
      if (i > 0) rollstr += ' + ';
      rollstr += val;
      total += val;
    }
    rollstr += ' = ' + total;
    return [total, rollstr];
  },

  computeMapCoordinates: function(e) {
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
    var coords = {
      x: Math.floor((x - w/2)/this.viewport.tileSize + this.viewport.x),
      y: Math.floor((y - h/2)/this.viewport.tileSize + this.viewport.y)
    };
    return coords;
  },

  onCharacterDragOver: function(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  },

  onCharacterDrop: function(e) {
    var coords = this.computeMapCoordinates(e);
    //TODO(kevers): Separate lists for characters on map and sidebar.
    // register, unregister, add, remove.
    var xml = e.dataTransfer.getData('text/xml');
    var parser=new DOMParser();
    var xmlDoc = parser.parseFromString(xml, "text/xml");
    var node = xmlDoc.getElementsByTagName('character')[0];
    if (!node)
      return;
    var name = node.getAttribute('name');
    if (name) {
      var found = false;
      for (var i = 0; i < this.characterRegistry.length; i++) {
        if (this.characterRegistry[i].name == name) {
          found = true;
          break;
        }
      }
      if (!found)
        return;
      var characterData = {
        name: name,
        x: coords.x,
        y: coords.y
      }
      var evt = {
        type: 'add-character-instance',
        character: characterData
      }
      this.sendEvent(evt);
    }
  },

  onFileDragOver: function(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  },

  onMapTileDrop: function(e) {
    var files = e.dataTransfer.files;
    this.loadFiles(files, this.loadMapTile.bind(this));
  },

  loadMapTile: function(file) {
    var reader = new FileReader();
    var filename = file.name;
    var self = this;

    reader.onload = function(evt) {
      // Assuming image content, encoding as base64 uri.
      var evt = {
        type: 'add-tile',
        image: evt.target.result,
      };
      self.sendEvent(evt);
    }
    reader.readAsDataURL(file);
  },

  saveMap: function() {
    var mapData = JSON.stringify({
      type: 'map',
      map: this.map,
      mapTiles: this.mapTiles,
    });
    window.open('data:text;charset=utf-8,' + encodeURI(mapData));
  },

  onFileDrop: function(e) {
    var files = e.dataTransfer.files;
    this.loadFiles(files, dungeon.ParseFile.bind(undefined, this));
  },

  onFileSelect: function(e) {
    var files = e.target.files;
    this.loadFiles(files, dungeon.ParseFile.bind(undefined, this));
  },

  /**
   * Loads one or more files.  This is the entry point for all file types.
   * Currently only D&D player files (dnd4e extension) are handled.  More to
   * follow.
   * @param {File|FileList} file File or list of files to load.
   * @param {function(file, DungeonClient)} handler Function to call per file.
   */
  loadFiles: function(file, handler) {
    if (file) {
      if (file instanceof FileList) {
        for (var i = 0; i < file.length; i++)
          this.loadFiles(file[i], handler);
      } else {
        handler(file);
      }
    }
  },

  rebuildTiles: function() {
    for (var i = 0; i < this.mapTiles.length; i++) {
      if (!this.ui.mapImages[i])
        this.ui.mapImages[i] = new Image();

      // TODO: Only reset images when necessary.
      this.ui.mapImages[i].src = this.mapTiles[i].src;
    }
    this.ui.mapImages.splice(this.mapTiles.length, this.ui.mapImages.length);
    dungeon.MapEditor.loadTiles(this.mapTiles);
  },

  updateCharacterRegistry: function(character) {
    var name = character.name;
    // Update in character list.
    if (name in this.characterList)
       this.updateCharacter(character);
    else
       this.addCharacter(character);
  },

  addCharacter: function(characterData) {
    var element = dungeon.CharacterButton(characterData);
    this.characterList[characterData.name] = element;
    $('sidebar-character-list').appendChild(element);
  },

  updateCharacter: function(characterData) {
     //TODO(kellis): Implement me.
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
        ctx.drawImage(this.ui.mapImages[this.map[i][j]],
                      baseX + (j - view.x1) * this.viewport.tileSize,
                      baseY + (i - view.y1) * this.viewport.tileSize, 
                      this.viewport.tileSize, this.viewport.tileSize);
      }
    }
    ctx.font = '12px Arial'; // (this.viewport.tileSize - 5) + 'px Arial';
    for (var i = 0; i < this.characterPlacement.length; i++) {
      var character = this.characterPlacement[i];
      var name = character.name;
      ctx.fillStyle = '#f00';

      ctx.beginPath();
      var w = this.viewport.tileSize;
      var x = baseX + (character.x - view.x1) * w + w / 2;
      var y = baseY + (character.y - view.y1) * w + w / 2;
      ctx.arc(x, y, this.viewport.tileSize/4, 0, 2*Math.PI, true);
      ctx.fill();
      ctx.fillText(name, x + w / 4, y - w / 4);
    }    
  },

});

document.addEventListener('DOMContentLoaded', function() {
  new dungeon.Client();
});
