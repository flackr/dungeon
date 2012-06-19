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

    this.combatTracker = new dungeon.CombatTracker(this);
    this.characterDetailsPage = new dungeon.CharacterDetailsPage(this);
    this.combatOverviewPage = new dungeon.CombatOverviewPage(this); 
    dungeon.initializeDialogs(this);

    this.canvas = $('game-canvas');
    this.socket = io.connect('http://' + location.host);

    this.socket.on('e', this.receiveEvent.bind(this));
    this.canvas.addEventListener('mousedown', this.onPointerDown.bind(this));
    this.canvas.addEventListener('mousewheel', this.onMouseWheel.bind(this));
    document.body.addEventListener('keydown', this.onKeyDown.bind(this));

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

    // Status of combat.
    this.combatState = 'stopped';
    $('combat-start-button').addEventListener('click', this.setCombatState.bind(this, 'start'));
    $('combat-pause-button').addEventListener('click', this.setCombatState.bind(this, 'pause'));
    $('combat-stop-button').addEventListener('click', this.setCombatState.bind(this, 'stop'));
    this.addEventListener('combat-state-changed', this.onCombatStateChanged.bind(this));
    this.addEventListener('initiative-order-changed', this.onInitiativeOrderChanged.bind(this));

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
      var displayed = self.combatTracker.displayedCharacterName();
      if (name == displayed)
        self.dispatchEvent('character-selected', self.characterPlacement[c]);
    });

    // Auto-select character when power is activated.
    this.combatTracker.addEventListener('power-selected', function(characterName) {
      // Deselect any current targets when power selection changes.
      self.ui.targets = [];
      self.ui.selected = undefined;
      for(var i = 0; i < self.characterPlacement.length; i++) {
        if(self.characterPlacement[i].name == characterName) {
          self.ui.selected = i;
          break;
        }
      }
      self.update();
    });
    this.addEventListener('character-selected', function() {
      self.ui.targets = [];
      self.update();
    });
    this.addEventListener('combat-add-target', this.addCombatTarget.bind(this));
    this.combatTracker.addEventListener('use-power', this.onUsePower.bind(this));

    this.viewport = {
      x: 30,
      y: 30,
      tileSize: 32,
      tileSizeFloat: 32,
    };

    dungeon.Game.prototype.initialize.call(this);
    this.resize();
  },

  addCombatTarget: function(index) {
    if (!this.ui.targets)
      this.ui.targets = [];
    this.ui.targets.push(index);
    this.update();
  },

  attackTargets: function() {
    var power = this.combatTracker.selectedPower();
    if (power && this.ui.targets && this.ui.selected !== undefined && this.ui.targets.length) {
      this.dispatchEvent('power-used');
      this.attack(this.ui.selected, this.ui.targets, power);
      this.ui.targets = [];
      this.ui.selected = undefined;
      this.update();
    }
  },

  getCharacter: function(index) {
    return this.characterPlacement[index];
  },

  getCharacterIndex: function(name) {
    for (var i = 0; i < this.characterPlacement.length; i++) {
      var candidate = this.characterPlacement[i].name;
      if (candidate == name)
        return i;
    }
  },

  reset: function() {
    dungeon.Game.prototype.reset.call(this);

    this.ui = {
      selected: undefined,
      mapImages: [],
      stale: false,
    };

    this.characterList = {};
    var characters = $('sidebar-character-list').getElementsByClassName('character-button');
    for (var i = characters.length - 1; i >= 0; i--) {
      if (characters[i].getAttribute('id') != 'character-template')
        characters[i].parentNode.removeChild(characters[i]);
    }
    var messageArea = document.getElementById('combat-message-area');
    if (messageArea)
      messageArea.textContent = '';

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
    load($('combat-tracker-page'), function() {
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
    });
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

  setCombatState: function(state) {
    if (state == 'start' && this.combatState != 'stopped')
      state = 'resume';
    this.sendEvent({type: 'combat-state-change', state: state});
    if (state == 'start') {
      // TODO(kellis): Reset message log.

      // Set initiative.
      var characterTypeMap = {};
      var initiativeMap = {};
      for (var i = 0; i < this.characterPlacement.length; i++) {
        var character = this.characterPlacement[i];
        var type = character.source.name;
        var entry = characterTypeMap[type];
        if (!entry) {
          var score = this.rollInitiative(character);
          entry = characterTypeMap[type] = {initiative: score, list: []};
          if (!initiativeMap[score])
            initiativeMap[score] = [];
          initiativeMap[score].push(character.source);
        }
        entry.list.push(character);
      }
      // Tie breaks.
      while (true) {
        foundCollision = false;
        for (var entry in initiativeMap) {
          var list = initiativeMap[entry];
          if (list.length > 1) {
            this.sendEvent({type: 'log', text: 'Initiative tiebreak!'});
            foundCollision = true;
            for (var i = 0; i < list.length; i++) {
              var score = this.rollInitiative(list[i]);
              var revisedScore = String(entry) + '.' + score;
              var msg = 'Revised initiative = ' + revisedScore;
              this.sendEvent({type: 'log', text: msg});
              if (!initiativeMap[revisedScore])
                initiativeMap[revisedScore] = [];
              initiativeMap[revisedScore].push(character.source);
              characterTypeMap[list[i].name].initiative = revisedScore;
            }
            initiativeMap[entry] = [];
          }
        }
        if (!foundCollision)
          break;
      }
      // Synchronize initiative order across clients.
      var evt = {
        type: 'set-initiative-order',
        order: []
      }
      for (var i = 0; i < this.characterPlacement.length; i++) {
         var character = this.characterPlacement[i];
         var entry = characterTypeMap[character.source.name];
         evt.order.push({name: character.name, initiative: entry.initiative});
      }
      this.sendEvent(evt);

    } else if (state == 'stop') {
      // Restore encounter powers for players.
    }
  },

  rollInitiative: function(characterData) {
    if (characterData.source)
      characterData = characterData.source;
    var name = name;
    var initiative = parseInt(characterData.stats['Initiative']);
    var score = Math.floor(Math.random() * 20 + 1);
    var msg = characterData.name + ' rolls initiative.\n' +
        'd20 + ' + initiative + ' = (' + score + ') ' + ' + ' + initiative +
        ' = ' + (score += initiative) + '\n';
    this.sendEvent({type: 'log', text: msg}); 
    score = String(score);
    if (score.length == 1)
      score = '0' + score;
    return score;
  },

  onCombatStateChanged: function(state) {
    switch(state) {
    case 'start':
      this.combatState = 'started';
      break;
    case 'resume':
      this.combatState = 'resumed';
      break;
    case 'pause':
      this.combatState = 'paused';
      break;
    case 'stop':
      this.combatState = 'stopped';
      break;
    default:
      console.log('Unknown combat state: ' + state);
    }
    // update disabled state of combat controls
    $('combat-start-button').setAttribute('disabled', 
        this.combatState == 'started' || this.combatState == 'resumed');
    $('combat-pause-button').setAttribute('disabled', 
        this.combatState  == 'paused' || this.combatState == 'stopped');
    $('combat-stop-button').setAttribute('disabled', 
        this.combatState  == 'stopped');
    var msg = 'Combat ' + this.combatState + '.';
    this.sendEvent({type: 'log', text: msg});
    this.sendEvent({type: 'banner-message', text: msg});
  },

  onInitiativeOrderChanged: function(list) {
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      var index = this.getCharacterIndex(entry.name);
      if (index != undefined) {
        this.characterPlacement[index].initiative = entry.initiative;
        this.dispatchEvent('character-updated', index);
      }
    }
    // Update ordering in combat overview.
    this.combatOverviewPage.sortIntoInitiativeOrder();
  },

  onSelectView: function(category, view) {
    // Check if page is already active
    var isActive = !!$(view + '-selector').getAttribute('active');
    var isVisible = !$(view + '-page').hidden;
    if (isActive == isVisible)
      return;

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
          this.dispatchEvent('combat-add-target', i);
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
    var mouse = this.computeMapCoordinatesDouble(e);
    this.zoom(delta, mouse);
  },
  
  onKeyDown: function(e) {
    var key = e.keyCode;
    if (key == 187 || key == 107) // = or numpad +
      this.zoom(1);
    else if (key == 189 || key == 109) // - or numpad -
      this.zoom(-1);
    else if (key == 32 || key == 13) {
      if (this.ui.targets) {
        this.attackTargets();
      }
    } else if (key == 27) {
      if (this.ui.targets) {
        this.ui.targets.pop();
        this.update();
      }
    }
  },
  
  /*
  @param {number} delta Number of zoom steps.  Negative for zooming out and positive for zooming in.
  @param {{x:number, y:number}} mouse Float tile x and y on the map.
  */
  zoom: function(delta, mouse) {
    var oldTileSize = this.viewport.tileSizeFloat;
    var newTileSize = Math.max(1, oldTileSize * Math.pow(1.1, Math.floor(delta)));
    this.viewport.tileSizeFloat = newTileSize;
    newTileSize = Math.round(newTileSize);
    var zoomRatio = (newTileSize - Math.round(oldTileSize)) / newTileSize;
    if (zoomRatio != 1) {
      if (mouse) {
        this.viewport.x += ((mouse.x - this.viewport.x) * zoomRatio);
        this.viewport.y += ((mouse.y - this.viewport.y) * zoomRatio);
      }
      this.viewport.tileSize = newTileSize;
      this.update();
    }
    
  },

  attack: function(attacker, attackees, power) {
    var attackMessage = this.characterPlacement[attacker].name + ' attacks ';
    var targetNames = [];
    for (var i = 0; i < attackees.length; i++)
      targetNames.push(this.characterPlacement[attackees[i]].name);
    attackMessage += targetNames.join(', ') + ' with ' + power.name + '.';
    this.sendEvent({type: 'log', text: attackMessage});
    var toHitStr = '1d20 + ' + power.toHit;
    var dmgStr = power.damage;
    var logStr = 'Rolling damage: ' + dmgStr + '\n';
    var damage = this.rollDice(this.parseRollString(dmgStr));
    logStr += damage[1] + '\n';
    logStr += 'Rolling attack(s): ' + toHitStr + '\n';
    var attack = [];
    var damages = [];
    for (var i = 0; i < attackees.length; i++) {
      var curattack = this.rollDice(this.parseRollString(toHitStr));
      if (curattack[2][0][0] == 20) {
        logStr+= 'Critical HIT '+curattack[1]+'\n';
        curattack[2][0][0] = 100;
        damages.push(this.rollDiceMax(this.parseRollString(dmgStr)));
      } else {
        logStr += curattack[1] + '\n';
        damages.push(damage[0]);
      }
      attack.push(curattack[0]);
    }
    this.sendEvent({type: 'log', text: logStr});
    this.attackResult(attacker, attackees, power, attack, damages);
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

  attackResult: function(attacker, attackees, power, tohits, dmg) {
    var attackedStat = power.defense;
    var result = {
      type: 'attack-result',
      characters: [],
      log: '',
    }
    for (var i = 0; i < attackees.length; i++) {
      var defStat = parseInt(
          this.characterPlacement[attackees[i]].condition.stats[attackedStat]);
      if (defStat <= tohits[i]) {
        result.log += this.characterPlacement[attacker].name + ' hits ' +
          this.characterPlacement[attackees[i]].name + ' for ' + dmg[i] + ' damage.\n';
        var temps = 0;
        if (this.characterPlacement[attackees[i]].condition.stats['Temps'])
          temps = parseInt(this.characterPlacement[attackees[i]].condition.stats['Temps']);
        var newhp = parseInt(this.characterPlacement[attackees[i]].condition.stats['Hit Points']);
        temps = temps - dmg[i];
        if (temps < 0) {
          newhp += temps;
          temps = 0;
        }
        result.characters.push(
            [attackees[i],
             {'Hit Points': newhp,
              'Temps': temps}]);
      } else {
        result.log += this.characterPlacement[attacker].name + ' misses ' +
          this.characterPlacement[attackees[i]].name + '.\n';
      }
    }
    this.sendEvent(result);
  },

  rollDice: function(rollArray) {
    var total = 0;
    var rollstr = '';
    var diceRolls = [];
    // Rolls the given dice.
    for (var i = 0; i < rollArray.length; i++) {
      if (i > 0) rollstr += ' + ';
      var val = rollArray[i][1];
      if (rollArray[i][0] > 0) {
        var curDieRolls = [];
        rollstr += '(';
        for (var j = 0; j < rollArray[i][0]; j++) {
          if (j > 0) rollstr += ' + ';
          val = Math.floor(Math.random() * rollArray[i][1] + 1);
          curDieRolls.push(val);
          rollstr += val;
          total += val;
        }
        diceRolls.push(curDieRolls);
        rollstr += ')';
      } else {
        rollstr += val;
        total += val;
      }
    }
    rollstr += ' = ' + total;
    return [total, rollstr, diceRolls];
  },

  rollDiceMax: function(rollArray) {
    var total = 0;
    // Rolls the given dice.
    for (var i = 0; i < rollArray.length; i++) {
      var val = rollArray[i][1];
      if (rollArray[i][0] > 0) {
        total += rollArray[i][0] * rollArray[i][1];
      } else {
        total += val;
      }
    }
    return total;
  },

  computeMapCoordinatesDouble: function(e) {
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
      x: (x - w/2)/this.viewport.tileSize + this.viewport.x,
      y: (y - h/2)/this.viewport.tileSize + this.viewport.y
    };
    return coords;
  },

  computeMapCoordinates: function(e) {
    var coords = this.computeMapCoordinatesDouble(e);
    coords.x = Math.floor(coords.x);
    coords.y = Math.floor(coords.y);
    return coords;
  },

  onCharacterDragOver: function(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  },

  onCharacterDrop: function(e) {
    var coords = this.computeMapCoordinates(e);
    //TODO(kevers): Ability to remove characters from sidebar and map.
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
      this.ui.mapImages[i].onload = this.update.bind(this);
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
    var element = new dungeon.CharacterButton(this, characterData); 
    this.characterList[characterData.name] = element;
    var list = $('sidebar-character-list');
    var nodes = list.getElementsByClassName('character-button');
    var insertIndex = -1;
    for (var i = 0; i < nodes.length; i++) {
      var name = nodes[i].getElementsByClassName('character-button-title')[0].textContent.trim();
      if (name > characterData.name) {
        insertIndex = i;
        break;
      }
    }
    if (insertIndex >= 0)
      list.insertBefore(element, nodes[insertIndex]);
    else
      list.appendChild(element);
  },

  updateCharacter: function(characterData) {
     //TODO(kellis): Implement me.
  },

  update: function() {
    // If the UI is marked stale already then a redraw should have already
    // been queued.
    if (!this.ui.stale) {
      this.ui.stale = true;
      requestAnimFrame(this.redraw.bind(this));
    }
  },

  redraw: function() {
    this.ui.stale = false;
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
      if (character.x < view.x1 || character.x >= view.x2 ||
          character.y < view.y1 || character.y >= view.y2)
        continue;
      var name = character.name;
      var isMonster = character.source.charClass == 'Monster';

      ctx.fillStyle = isMonster ? '#f00' : '#00f';

      ctx.beginPath();
      var w = this.viewport.tileSize;
      var x = baseX + (character.x - view.x1) * w + w / 2;
      var y = baseY + (character.y - view.y1) * w + w / 2;
      ctx.arc(x, y, w/4, 0, 2*Math.PI, true);
      ctx.fill();

      // TODO(flackr): This and the following should be outside of the loop
      // since they will happen for particular characters whose indices they
      // know.
      if (i == this.ui.selected) {
        ctx.beginPath();
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2;
        ctx.arc(x, y, w/4, 0, 2*Math.PI, true);
        ctx.stroke();
      }

      if (this.ui.targets) {
        var targetFreq = 0;
        for (var j = 0; j < this.ui.targets.length; j++) {
          if (this.ui.targets[j] == i) {
            targetFreq++;
          }
        }
        ctx.strokeStyle = '#f00';
        for (var j = 0; j < targetFreq; j++) {
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.arc(x, y, w/3 + j*3, 0, 2*Math.PI, true);
          ctx.stroke();
        }
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
      var hpPercent = character.condition.stats['Hit Points'] / character.source.stats['Hit Points'];
      var isBloodied = (character.condition.stats['Hit Points'] <= character.source.stats['Bloodied']);
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
