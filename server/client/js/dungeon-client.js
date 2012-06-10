dungeon.Client = function() {
  dungeon.Game.apply(this);
  this.initialize();
}

dungeon.Client.prototype = extend(dungeon.Game.prototype, {
  initialize: function() {
    var self = this;
    var role = 'player';
    if (window.location.hash == '#dm')
      role = 'dm';
    document.body.parentNode.setAttribute('role', role);

    this.canvas = $('game-canvas');
    this.socket = io.connect('http://' + location.host);

    this.socket.on('e', this.receiveEvent.bind(this));
    this.canvas.addEventListener('mousedown', this.onPointerDown.bind(this));
    this.canvas.addEventListener('mousewheel', this.onMouseWheel.bind(this));

    this.combatTracker = new dungeon.CombatTracker(this);

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
    this.addEventListener('log', this.logMessage.bind(this));
    this.addEventListener('banner-message', this.displayBannerMessage.bind(this));
    this.addEventListener('character-updated', function(c) {
      var name = self.characterPlacement[c].name;
      var displayed = this.combatTracker.displayedCharacterName();
      if (name == displayed)
        this.dispatchEvent('character-selected', self.characterPlacement[c]);
    });

    // Auto-select character when power is activated.
    this.combatTracker.addEventListener('power-selected', function(characterName) {
      self.ui.selected = undefined;
      for(var i = 0; i < self.characterPlacement.length; i++) {
        if(self.characterPlacement[i].name == characterName) {
          self.ui.selected = i;
          break;
        }
      }
      self.update();
    });

    this.combatTracker.addEventListener('use-power', this.onUsePower.bind(this));

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
    var characters = $('sidebar-character-list').getElementsByClassName('character-button');
    for (var i = characters.length - 1; i >= 0; i--) {
      if (characters[i].getAttribute('id') != 'character-template')
        characters[i].parentNode.removeChild(characters[i]);
    }
    $('combat-message-area').textContent = '';
    this.logMessage('Select a character to play!');

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

  logMessage: function(text) {
    var messageArea = $('combat-message-area');
    var clientHeight = messageArea.clientHeight;
    var scrollHeight = messageArea.scrollHeight;
    var scrollTop = messageArea.scrollTop;
    var div = document.createElement('div');
    div.className = 'combat-message';
    div.textContent = text;
    messageArea.appendChild(div);
    // Auto-scroll if at the bottom of the message area.
    var top = div.offsetTop;
    var height = div.clientHeight;
    if (top <= scrollTop + clientHeight && top + height > scrollTop + clientHeight)
      messageArea.scrollTop = scrollHeight + height - clientHeight;
  },

  displayBannerMessage: function(text) {
    var banner = $('map-banner-message');
    banner.textContent = text;
    // Animate fade.
    banner.classList.remove('fade-out');
    setTimeout(function() {
      banner.classList.add('fade-out');
    }, 0);
  },

  onUsePower: function(powerName, data) {
    if (this.ui.selected !== undefined) {
      var evt = {
        type: 'use-power',
        character: this.ui.selected,
        power: powerName
      };
      evt.data = data;
      this.sendEvent(evt);
    }
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
            (power = this.combatTracker.selectedPower())) {
          this.dispatchEvent('power-used');
          this.attack(this.ui.selected, i, power);
          this.ui.selected = undefined;
          this.update();
        } else {
          this.ui.selected = i;
          this.dispatchEvent('character-selected', this.characterPlacement[i]);
          this.update();
        }
        return;
      }
    }
    if (this.ui.selected !== undefined) {
      evt.type = 'move';
      evt.index = this.ui.selected;
      this.ui.selected = undefined;
      this.update();
      this.sendEvent(evt);
      return;
    }
  },
  
  onMouseWheel: function(e) {
    var delta = e.wheelDelta/120;
    this.viewport.tileSize = Math.max(1, this.viewport.tileSize + Math.floor(delta));
    this.update();
  },

  attack: function(attacker, attackee, power) {
    var attackMessage = this.characterPlacement[attacker].name + ' attacks ' +
      this.characterPlacement[attackee].name + ' with ' + power.name + '.';
    this.sendEvent({type: 'log', text: attackMessage});
    var toHitStr = '1d20 + ' + power.toHit;
    var dmgStr = power.damage;
    var logStr = 'Rolling attack: ' + toHitStr + '\n';
    var attack = this.rollDice(this.parseRollString(toHitStr));
    logStr += attack[1] + '\n';
    logStr += 'Rolling damage: ' + dmgStr + '\n';
    var damage = this.rollDice(this.parseRollString(dmgStr));
    logStr += damage[1];
    this.sendEvent({type: 'log', text: logStr});
    this.attackResult(attacker, attackee, power, attack[0], damage[0]);
    var usage = power.usage;
    if (usage == 'encounter' || usage == 'daily' || usage == 'recharge') {
      // TODO(kellis): Add support for recharge of powers and multi-use special powers.
      var evt = {
        type: 'power-consumed',
        character: attacker,
        power: power.name
      };
      this.sendEvent(evt);
    }
  },

  attackResult: function(attacker, attackee, power, tohit, dmg) {
    var attackedStat = power.defense;
    var defStat = parseInt(
        this.characterPlacement[attackee].condition.stats[attackedStat]);
    if (defStat <= tohit) {
      var logStr = this.characterPlacement[attacker].name + ' hits ' + 
        this.characterPlacement[attackee].name + ' for ' + dmg + ' damage.';
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
      var logStr = this.characterPlacement[attacker].name + ' misses ' + 
        this.characterPlacement[attackee].name + '.';
      this.sendEvent({type: 'log', text: logStr});
      this.sendEvent({type: 'banner-message', text: logStr});
    }
  },

  rollDice: function(rollArray) {
    var total = 0;
    var rollstr = '';
    // Rolls the given dice.
    for (var i = 0; i < rollArray.length; i++) {
      if (i > 0) rollstr += ' + ';
      var val = rollArray[i][1];
      if (rollArray[i][0] > 0) {
        rollstr += '(';
        for (var j = 0; j < rollArray[i][0]; j++) {
          if (j > 0) rollstr += ' + ';
          val = Math.floor(Math.random() * rollArray[i][1] + 1);
          rollstr += val;
          total += val;
        }
        rollstr += ')';
      } else {
        rollstr += val;
        total += val;
      }
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
    var role = document.body.parentNode.getAttribute('role');
    for (var i = 0; i < this.characterPlacement.length; i++) {
      var character = this.characterPlacement[i];
      var name = character.name;
      var isMonster = character.source.charClass == 'Monster';

      ctx.fillStyle = isMonster ? '#f00' : '#00f';

      ctx.beginPath();
      var w = this.viewport.tileSize;
      var x = baseX + (character.x - view.x1) * w + w / 2;
      var y = baseY + (character.y - view.y1) * w + w / 2;
      ctx.arc(x, y, w/4, 0, 2*Math.PI, true);
      ctx.fill();

      if (i == this.ui.selected) {
        ctx.beginPath();
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2;
        ctx.arc(x, y, w/4, 0, 2*Math.PI, true);
        ctx.stroke();
      }

      // Health bars
      var px = 1 / 32 * w;
      var hx = Math.round(x - w / 2 + 1 + 1 * px);
      var hy = Math.round(y - w / 2 + 1 + 1 * px);
      var hw = Math.max(10, Math.round(w - 2 - 2 * px));
      var hh = Math.max(1, Math.round(2 / 32 * w));
      // Black border
      ctx.fillStyle = '#000';
      ctx.fillRect(hx - 1, hy - 1, hw + 2, hh + 2);
      // Interior
      var hpPercent = character.condition.stats['Hit Points'] / character.condition.stats['Max Hit Points'];
      var isBloodied = (character.condition.stats['Hit Points'] <= character.condition.stats['Bloodied']);
      var isDead = (character.condition.stats['Hit Points'] <= 0);
      if (isMonster) {
        ctx.fillStyle = isBloodied ? '#f00' : '#0f0';
        if (role == 'dm')
          ctx.fillRect(hx, hy, Math.max(0, Math.min(hw, Math.round(hw * hpPercent))), hh);
        else
          ctx.fillRect(hx, hy, Math.max(0, Math.min(hw, Math.round(hw * (isBloodied ? 0.5 : 1.0)))), hh);
          ctx.fillStyle = '#000';
          ctx.fillRect(Math.round(hx + hw * 1 / 2), hy, 1, hh);
          
      } else {
        if (!isBloodied) {
          ctx.fillStyle = "rgb(" + Math.round((1 - (hpPercent - 0.5) * 2) * 255) + ",255,0)";
        } else if (!isDead) {
          ctx.fillStyle = "rgb(255," + Math.round(hpPercent * 2 * 255) + ",0)";
        } else {
          ctx.fillStyle = "rgb(255,0,0)";
        }
        ctx.fillRect(hx, hy, Math.max(0, Math.min(hw, Math.round(hw * (0.5 + hpPercent) * 2.0 / 3.0))), hh);
        if (!isDead) {
          ctx.fillStyle = '#0f0';
          ctx.fillRect(hx, hy, Math.round(hw * 1.0 / 3.0), hh);
        }
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(hx + hw * 1 / 3), hy - 1, 1, hh + 2);
        ctx.fillStyle = '#000';
        ctx.fillRect(Math.round(hx + hw * 2 / 3), hy, 1, hh);
      }
      // Name
      ctx.font = Math.max(10, w/3) + "px Arial";
      ctx.fillStyle = isMonster ? '#f00' : '#00f';
      ctx.fillText(name, Math.round(x - ctx.measureText(name).width / 2), Math.round(y - w / 2 - 1 * px));
    }
  },

});

document.addEventListener('DOMContentLoaded', function() {
  new dungeon.Client();
});
