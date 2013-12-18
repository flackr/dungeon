dungeon.Client = function() {
  dungeon.Game.apply(this);
  this.initialize();
}

// temporary hack to enable rendering of dungeon.
function load() {};

dungeon.Client.prototype = extend(dungeon.Game.prototype, {
  initialize: function() {
    var self = this;
    window.addEventListener('hashchange', this.processHash.bind(this));
    this.processHash();

    // Repository of powers.
    this.powers = new dungeon.Powers(this);


    this.socket = io.connect('http://' + location.host);

    this.socket.on('e', this.receiveEvent.bind(this));

    this.registerHandler('map-update', 'onMapUpdate');
    this.registerHandler('load-file', 'onLoadFile');
    this.registerHandler('save-map', 'saveMap');

    this.addEventListener('character-added', this.update.bind(this));
    this.addEventListener('tile-added', this.rebuildTiles.bind(this));


/*
    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mousewheel', this.onMouseWheel.bind(this));
*/
    document.body.addEventListener('keyup', this.onKeyUp.bind(this));

/*
    $('attack-button').addEventListener('click', this.attackSelectedTargets.bind(this));
    $('cancel-button').addEventListener('click', this.cancelSelectedTarget.bind(this));

    // Status of combat.
    this.combatState = 'stopped';
    $('combat-start-button').addEventListener('click',
        this.setCombatState.bind(this, 'start'));
    $('combat-pause-button').addEventListener('click',
        this.setCombatState.bind(this, 'pause'));
    $('combat-stop-button').addEventListener('click', 
        this.setCombatState.bind(this, 'stop'));
    this.addEventListener('combat-state-changed', 
        this.onCombatStateChanged.bind(this));
    this.addEventListener('initiative-order-changed',
        this.onInitiativeOrderChanged.bind(this));
    this.addEventListener('character-removed', 
        this.onRemoveCharacter.bind(this));

    // Drag-n-drop of character files.
    var dropZone = $('sidebar');
    dropZone.addEventListener('dragover', this.onFileDragOver.bind(this));
    dropZone.addEventListener('drop', this.onFileDrop.bind(this));
*/
    
    this.addEventListener('character-loaded', this.updateCharacterRegistry.bind(this));
/*
    this.addEventListener('log', this.logMessage.bind(this));
    this.addEventListener('banner-message', this.displayBannerMessage.bind(this));

    this.addEventListener('character-selected', function() {
      self.ui.targets = [];
      self.update();
    });
    this.addEventListener('combat-add-target', this.addCombatTarget.bind(this));
    this.addEventListener('dm-attack-result', this.onDmAttackResultMsg.bind(this));
    this.combatTracker.addEventListener('use-power', this.onUsePower.bind(this));
    */
    dungeon.Game.prototype.initialize.call(this);

    dungeon.getClient = function() {
      return self;
    }
  },

  processHash: function() {
    var attributes = window.location.hash.substr(1).split('&');
    this.attributes = {};
    for (var i = 0; i < attributes.length; i++) {
      var pos = attributes[i].indexOf('=');
      if (pos == -1) {
        this.attributes[attributes[i]] = true;
      } else {
        this.attributes[attributes[i].substr(0, pos)] =
            attributes[i].substr(pos + 1);
      }
    }
    var role = 'player';
    var ui = 'desktop';
    if (this.attributes.ui)
      ui = this.attributes.ui;
    if (this.attributes.dm)
      role = 'dm';
    document.body.parentNode.setAttribute('role', role);
    document.body.parentNode.setAttribute('ui', ui);
    $('combat-map').setAttribute('role', role);
  },

  registerHandler: function(eventName, handlerName) {
    console.log('registering handler ' + handlerName + ' for event ' +
        eventName); 
    document.body.addEventListener(eventName, this[handlerName].bind(this));
  },

  /**
   * Dispatch map updates.
   * @param {Event} event Map update event.
   */
  onMapUpdate: function(event) {
    this.sendEvent(event.detail);
  },

  /**
   * Loads one or more files.
   * @param {Event} event File load event.
   */
  onLoadFile: function(event) {
    console.log('in onLoadFile');
    var file = event.detail.file;
    console.log('loading file: ' + file);
    this.loadFile(file, this.loadFile.bind(this));
  },

  addCombatTarget: function(index) {
    if (!this.ui.targets)
      this.ui.targets = [];
    this.ui.targets.push(index);
    this.update();
  },

  // TODO: rename since we're really using a power on targets, which may be allies.
  attackTargets: function() {
    var power = this.ui.activePower;
    if (power && this.ui.targets && this.ui.selected !== undefined && this.ui.targets.length) {
      // Power respository handles resolution of power.
      this.dispatchEvent('power-used');
      this.ui.targets = [];
      this.ui.selected = undefined;
      this.ui.path = null;
      this.update();
    }
  },

  getTargets: function() {
    return this.ui.targets;
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

  getCharacterByName: function(name) {
    var index = this.getCharacterIndex(name);
    return (index != undefined) ? this.getCharacter(index) : undefined;
  },

  /**
   * Select a character and power.
   * @param {string} characterName Name of the character.
   * @param {stirng} powerName Name of the power.
   * @return {boolean} True if successful.
   */
  selectPower: function(characterName, powerName) {
    if (!powerName) {
      this.ui.activePower = null;
      return;
    }
    var success = false;
    if (this.selectCharacterByName(characterName)) {
      success = true;
      var power = this.ui.activePower = this.powers.get(powerName);
      this.dispatchEvent('power-selected', characterName, powerName);
      this.ui.targets = [];
      if(power.autoSelect()) {
        var source = this.characterPlacement[this.ui.selected];
        for (var i = 0; i < this.characterPlacement.length; i++) {
          if (power.selectionMatch(source, this.characterPlacement[i]))
            this.ui.targets.push(i);
        }
        this.update();
      }
    }
    return success;
  },

  /**
   * Selects a character by name.  Multiple monsters in the same group have
   * a numeric suffix to ensure uniqueness of the name.
   * @param {string} characterName  Unique name of the character.
   * @return {boolean} True if successful.
   */
  selectCharacterByName: function(characterName) {
    var index = characterName ?
        this.getCharacterIndex(characterName) : undefined;
    var success = index != undefined;
    if (index != this.ui.selected) {
      this.ui.selected = index;
      this.update();
      if (success) {
        this.dispatchEvent('character-selected', success ? 
            this.characterPlacement[index] : null);
      }
    }
    return success;
  },

  reset: function() {
    dungeon.Game.prototype.reset.call(this);

    this.ui = {
      selected: undefined,
      mapImages: [],
      stale: false,
    };

    this.characterList = {};

    // Map related.
    this.rebuildTiles();
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
      var msgLog = [];
      var characterTypeMap = {};
      var initiativeMap = {};
      for (var i = 0; i < this.characterPlacement.length; i++) {
        var character = this.characterPlacement[i];
        var type = character.source.name;
        var entry = characterTypeMap[type];
        if (!entry) {
          var score = this.rollInitiative(character, msgLog);
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
            msgLog.push('Initiative tiebreak!');
            foundCollision = true;
            for (var i = 0; i < list.length; i++) {
              var score = this.rollInitiative(list[i], msgLog);
              var revisedScore = String(entry) + '.' + score;
              msgLog.push('Revised initiative = ' + revisedScore);
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
        order: [],
        log: msgLog
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

  rollInitiative: function(characterData, msgLog) {
    if (characterData.source)
      characterData = characterData.source;
    var name = name;
    var initiative = parseInt(characterData.stats['Initiative']);
    var score = Math.floor(Math.random() * 20 + 1);
    var msg = characterData.name + ' rolls initiative.\n' +
        'd20 + ' + initiative + ' = (' + score + ') ' + ' + ' + initiative +
        ' = ' + (score += initiative) + '\n';
    msgLog.push(msg);
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
    this.dispatchEvent('log',  msg); 
    this.dispatchEvent('banner-message', msg);
  },

  onInitiativeOrderChanged: function(list, log) {
    for (var i = 0; i < log.length; i++)
      this.dispatchEvent('log', log[i]);
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      var index = this.getCharacterIndex(entry.name);
      if (index != undefined) {
        this.characterPlacement[index].initiative = entry.initiative;
        this.dispatchEvent('character-updated', index);
      }
    }
    // Update ordering in combat overview.
    this.combatTracker.sortIntoInitiativeOrder();
    this.combatOverviewPage.sortIntoInitiativeOrder();
  },

  /**
   * Deselect character if removed from game.
   */
  onRemoveCharacter: function(characterName) {
    var index = this.getCharacterIndex(characterName);
    if (index == this.ui.selected) {
      this.ui.selected = undefined;
      this.update();
    } 
  },

  onTouchStart: function(e) {
    e.preventDefault();
    function convertSingleTouchEvent(e) {
      if (e.changedTouches.length > 0) {
        e.clientX = e.changedTouches[0].clientX;
        e.clientY = e.changedTouches[0].clientY;
      }
      return e;
    }
    function convertSingleTouchHandler(fn, e) {
      fn(convertSingleTouchEvent(e));
    }
    e = convertSingleTouchEvent(e);
    if (e.changedTouches.length == 1) {
      this.pointer = {
        listeners: {
          touchend: convertSingleTouchHandler.bind(null, this.onPointerUp.bind(this)),
          touchmove: convertSingleTouchHandler.bind(null, this.onPointerMove.bind(this)),
          touchcancel: convertSingleTouchHandler.bind(null, this.onPointerOut.bind(this))}};
      this.onPointerDown(e);
    } else {
      // More than 1 touch cancels.
      this.onPointerOut(e);
    }
  },

  onMouseMove: function(e) {
    if (!this.pointer)
      this.onPointerHover(e);
  },

  onMouseDown: function(e) {
    e.preventDefault();
    this.pointer = {
      listeners: {
        mouseup: this.onPointerUp.bind(this),
        mouseout: this.onPointerOut.bind(this),
        mousemove: this.onPointerMove.bind(this)}
    };
    var selectedTile = dungeon.MapEditor.selectedTile();
    var selectedSize = dungeon.MapEditor.selectedSize();
    if (selectedTile == -1) {
      this.onPointerDown(e);
    } else {
      var lastpos = this.computeMapCoordinates(e);

      var self = this;
      var paint = function(pos) {
        if (self.map.length > pos.y && self.map[pos.y].length > pos.x) {
          if (selectedSize == 0) {
            var obj = {x: pos.x, y: pos.y, tile: selectedTile, w: 2, h: 2};
            self.sendEvent({type: 'add-object', details: obj});
          } else {
            pos.type = 'change';
            pos.value = selectedTile;
            pos.size = selectedSize;
            self.sendEvent(pos);
          }
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

  onPointerDown: function(e) {
    if (dungeon.MapEditor.selectedSize() == 0 &&
        this.ui.selectedObject !== undefined) {
      var objIndex = this.ui.selectedObject;
      var evt = this.computeMapCoordinates(e);
      var posx = evt.x - this.objects[objIndex].x;
      var posy = evt.y - this.objects[objIndex].y;
      if (posx < 0 || posy < 0 || posx >= this.objects[objIndex].w || posy >= this.objects[objIndex].h) {
        this.pointer.mode == 'select';
      } else {
        this.pointer.startx = evt.x;
        this.pointer.starty = evt.y;
        this.pointer.offx = posx;
        this.pointer.offy = posy;
        if (posx == this.objects[objIndex].w - 1 &&
            posy == this.objects[objIndex].h - 1)
          this.pointer.mode = 'resize';
        else
          this.pointer.mode = 'move';
      }
    } else {
      this.pointer.mode = 'select';
    }
    this.pointer.x1 = e.clientX;
    this.pointer.y1 = e.clientY;
    this.pointer.mapX = this.viewport.x;
    this.pointer.mapY = this.viewport.y;
    for (var i in this.pointer.listeners)
      this.canvas.addEventListener(i, this.pointer.listeners[i]);
  },

  onPointerMove: function(e) {
    var deltaX = e.clientX - this.pointer.x1;
    var deltaY = e.clientY - this.pointer.y1;
    var dragThreshold = 10;
    if (this.pointer.mode == 'resize') {
      var evt = this.computeMapCoordinates(e);
      var object = this.objects[this.ui.selectedObject];
      if (object.w == evt.x - object.x + 1 &&
          object.h == evt.y - object.y + 1)
        return;
      this.sendEvent({type: 'update-object',
                      index: this.ui.selectedObject,
                      details: {w: evt.x - object.x + 1,
                                h: evt.y - object.y + 1}});
    } else if (this.pointer.mode == 'move') {
      var evt = this.computeMapCoordinates(e);
      var newx = evt.x - this.pointer.offx;
      var newy = evt.y - this.pointer.offy;
      var object = this.objects[this.ui.selectedObject];
      if (object.x == newx && object.y == newy)
        return;
      this.sendEvent({type: 'update-object',
                      index: this.ui.selectedObject,
                      details: {x: newx, y: newy}});
    } else if (this.pointer.dragStarted || Math.abs(deltaX) + Math.abs(deltaY) > dragThreshold) {
      this.pointer.dragStarted = true;
      this.viewport.x = (this.pointer.mapX - deltaX / this.viewport.tileSize);
      this.viewport.y = (this.pointer.mapY - deltaY / this.viewport.tileSize);
      this.update();
    }
  },

  onPointerHover: function(e) {
    if (this.ui.selected !== undefined) {
      var evt = this.computeMapCoordinates(e);
      if (this.ui.activePower) {
        // Conditional update of selection on hover.
        var power = this.ui.activePower;
        if (power.selectOnMove() &&
            power.getPhase() == dungeon.Power.Phase.TARGET_SELECTION)
          this.selectTargets(evt);
      } else {
        // TODO: Should moves be treated as a special category of powers?
        if (!this.ui.path || this.ui.path.dx != evt.x || this.ui.path.dy != evt.y) {

          this.ui.path = {dx: evt.x, dy: evt.y,
                          path: this.computePath(this.characterPlacement[this.ui.selected],
                                                 evt.x, evt.y)};
          this.update();
        }
      }
    }
  },

  onPointerOut: function(e) {
    for (var i in this.pointer.listeners)
      this.canvas.removeEventListener(i, this.pointer.listeners[i]);
    this.pointer = null;
  },

  onPointerUp: function(e) {
    // ported
  },
  
  onKeyUp: function(e) {
    var key = e.keyCode;
    if (key == 32 || key == 13) {
      this.attackSelectedTargets();
    } else if (key == 27) {
      this.cancelSelectedTarget();
    }
  },

  attackSelectedTargets: function() {
    if (this.ui.targets) {
      this.attackTargets();
    }
  },

  cancelSelectedTarget: function() {
      if (this.ui.targets) {
        this.ui.targets.pop();
        this.update();
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
      var defStat = parseInt(this.getCharacterAttribute(
          this.characterPlacement[attackees[i]],
          attackedStat));
      if (defStat <= tohits[i]) {
        //TODO: Flag critical hit, or miss.
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

  /**
   * Show attack results to DM for final blessing.
   * @param {Object} message Message containing the attack details.
   *    See dmAttackResult for a full description of the message.
   */
  onDmAttackResultMsg: function(message) {
    var role = document.body.parentNode.getAttribute('role');
    if (role == 'dm') {
      this.dmAttackResult(message.result);
    }
  },

  /**
   * 
   */
  dmAttackResult: function(result) {
    var role = document.body.parentNode.getAttribute('role');
    if (role == 'dm') {
      var dialog = dungeon.Dialog.getInstance('use-power');
      dialog.update(result);
      dialog.show();
    } else {
      var message = {
        type: 'dm-attack-result',
        result: result
      }
      this.sendEvent(message);
    }
  },

  onFileDragOver: function(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
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
    this.loadFiles(files, this.loadFile.bind(this));
  },

  loadFile: function(file) {
    var filename = file.name;
    var extension = filename.substr(filename.lastIndexOf('.') + 1);
    if (extension == 'png' ||
        extension == 'jpg' ||
        extension == 'jpeg' ||
        extension == 'svg' ||
        extension == 'gif' ||
        extension == 'bmp') {
      this.loadMapTile(file);
    } else if (extension == 'dnd4e' || extension == 'monster') {
      // character or monster.
      dungeon.ParseFile(this, file);
    } else {
      // map.
      dungeon.ParseFile(this, file);
    }
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
    this.dispatchEvent('update-tiles');
  },

  updateCharacterRegistry: function(character) {
    var name = character.name;
    this.characterList[name] = character;
    this.dispatchEvent('character-registry-update', name);
  },

  update: function() {
    var map = $('combat-map');
    if (map && map.update) {
      map.update();
    }
  },

  computePath: function(character, dest_x, dest_y) {
    var self = this;
    // Computes a best case movement for a character.
    var h = function(dx, dy) {
      var d = Math.max(dx, dy);
      d += Math.max(0, Math.min(dx, dy) - Math.floor(d / 2));
      return d;
    }
    var compute_score = function(info) {
      // TODO: Allow shifting by more than 1 for certain characters.
      return (info.d > 1 ? (info.oa * 100) : 0) + info.d + (info.diag ? 0.5 : 0);
    }
    var in_bounds = function(x, y) {
      return x >= 0 && y >= 0 && y < self.map.length && x < self.map[0].length;
    }
    var char_team = function(character) {
      return character.source.charClass == 'Monster' ? 2 : 1;
    }
    var enemies_adjacent = function(x, y, radius, team) {
      var enemies = 0;
      for (var i = 0; i < self.characterPlacement.length; i++) {
        if ((!team || char_team(self.characterPlacement[i]) != team) &&
            Math.abs(self.characterPlacement[i].x - x) <= radius &&
            Math.abs(self.characterPlacement[i].y - y) <= radius)
        enemies++;
      }
      return enemies;
    }
    var direction = [[-1, 0], [0, -1], [1, 0], [0, 1],
                     [-1, -1], [1, -1], [1, 1], [-1, 1]];
    var pq = new PriorityQueue();
    pq.enqueue(0, {x: character.x, y: character.y, oa: 0, d: 0, diag: false, score: 0});
    var path = [];
    var queue = [];
    var pos;
    var move_team = char_team(character);
    // TODO: Stop searching when the heuristic distance calculation is further
    // than our range instead of searching up to our range.
    while (pos = pq.dequeue()) {
      if (pos.d > parseInt(character.condition.stats.Speed) + 2)
        continue;
      if (!path[pos.y]) path[pos.y] = [];
      if (path[pos.y][pos.x] && path[pos.y][pos.x].score <= pos.score)
        continue;
      path[pos.y][pos.x] = pos;
      if (pos.y == dest_y && pos.x == dest_x)
        break;
      for (var i = 0; i < direction.length; i++) {
        var next = {x: pos.x + direction[i][0],
                    y: pos.y + direction[i][1]};
        if (!in_bounds(next.x, next.y) ||
            enemies_adjacent(next.x, next.y, 0))
          continue
        // TODO: Only allow each enemy to opportunity attack once.
        next.oa = pos.oa + enemies_adjacent(pos.x, pos.y, 1, move_team);
        next.d = pos.d + 1;
        next.diag = false;
        if (i >= 4) {
          if (pos.diag)
            next.d++;
          else
            next.diag = true;
        }
        next.dir = i;
        next.score = compute_score(next);
        pq.enqueue(next.score + h(Math.abs(dest_x - next.x), Math.abs(dest_y - next.y)), next);
      }
    }
    if (path && path[dest_y] && path[dest_y][dest_x]) {
      var dir;
      var spath = [];
      while(dest_y != character.y || dest_x != character.x) {
        spath.push(pos = path[dest_y][dest_x]);
        dest_x -= direction[pos.dir][0];
        dest_y -= direction[pos.dir][1];
      }
      spath.push(path[dest_y][dest_x]);
      spath.reverse();
      for (var i = 0; i < spath.length - 1; i++)
        spath[i].dir = spath[i + 1].dir;
      return spath;
    }
    return null;
  },

  
  redraw: function() {
    return;

    // Draw target indicators.  Critters may be targetted multiple times.
    if (this.ui.targets) {
      var targetFreq = {};
      for (var j = 0; j < this.ui.targets.length; j++) {
        var index = this.ui.targets[j];
        if (index in targetFreq)
          targetFreq[index]++;
        else
          targetFreq[index] = 1;
      }
      ctx.strokeStyle = '#f00';
      for (var index in targetFreq) {
        var character = this.characterPlacement[index];
        var tw = this.viewport.tileSize;
        var width = tw * this.getCharacterWidthInTiles(index);
        var baseRadius = width / 2 - tw / 4 + 3;
        var x = baseX + (character.x - view.x1) * tw + width / 2;
        var y = baseY + (character.y - view.y1) * tw + width / 2;
        for (var j = 0; j < targetFreq[index]; j++) {
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.arc(x, y, baseRadius + j * 3, 0, 2*Math.PI, true);
          ctx.stroke();
        }
      }
    }

    // TODO: Fix path for critters with size >= Large.  Index of critter is in
    // the top left corner.  Path should trace from center or from edge closest
    // to move direction.
    if (this.ui.path && this.ui.path.path && this.ui.path.path.length) {
      ctx.strokeStyle = '#f00';
      ctx.beginPath();
      ctx.lineWidth = 2;
      for (var j = 0; j < this.ui.path.path.length; j++) {
        var x = baseX + (this.ui.path.path[j].x - view.x1) * tw + tw / 2;
        var y = baseY + (this.ui.path.path[j].y - view.y1) * tw + tw / 2;
        if (j == 0)
          ctx.moveTo(x, y);
        else
          ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },

});

document.addEventListener('DOMContentLoaded', function() {
  new dungeon.Client();
});
