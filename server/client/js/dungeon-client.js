dungeon.Client = function() {
  dungeon.Game.apply(this);
  this.initialize();
}

dungeon.Client.prototype = extend(dungeon.Game.prototype, {
  initialize: function() {
    var self = this;
    window.addEventListener('hashchange', this.processHash.bind(this));
    this.processHash();

    this.combatTracker = new dungeon.CombatTracker(this);
    this.characterDetailsPage = new dungeon.CharacterDetailsPage(this);
    this.combatOverviewPage = new dungeon.CombatOverviewPage(this); 
    dungeon.initializeDialogs(this);

    this.canvas = $('game-canvas');
    this.socket = io.connect('http://' + location.host);

    this.socket.on('e', this.receiveEvent.bind(this));
    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
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
      this.ui.path = null;
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
    this.dispatchEvent('log', 'Welcome to dungeon.');

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
    if (selectedTile == -1) {
      this.onPointerDown(e);
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

  onPointerDown: function(e) {
    this.pointer.mode = 'select';
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
    if (this.pointer.dragStarted || Math.abs(deltaX) + Math.abs(deltaY) > dragThreshold) {
      this.pointer.dragStarted = true;
      this.viewport.x = (this.pointer.mapX - deltaX / this.viewport.tileSize);
      this.viewport.y = (this.pointer.mapY - deltaY / this.viewport.tileSize);
      this.update();
    }
  },

  onPointerHover: function(e) {
    if ((this.ui.selected!== undefined) && !this.combatTracker.selectedPower()) {
      var evt = this.computeMapCoordinates(e);
      if (!this.ui.path || this.ui.path.dx != evt.x || this.ui.path.dy != evt.y) {

        this.ui.path = {dx: evt.x, dy: evt.y,
                        path: this.computePath(this.characterPlacement[this.ui.selected],
                                               evt.x, evt.y)};
        this.update();
      }
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
          this.ui.path = null;
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

    // Allow effect bonus for attacker.
    var bonus = this.getCharacterAttribute(this.characterPlacement[attacker], 'Attack');
    if (bonus)
      toHitStr += ' + ' + bonus;

    var adjustedToHitString = [];
    for (var i = 0; i < attackees.length; i++) {
      if (this.hasEffect(this.characterPlacement[attackees[i]], 'Grants Combat Advantage')) {
        // TODO(kellis): Not quite generic enough as in some cases the bonus can be higher for
        // having combat advantage.  Keeping it separate from Defense modifier to more closely
        // reflect game mechanics and to be more visible.
        adjustedToHitString[i] = toHitStr + ' + 2';
      }
    }

    var dmgStr = power.damage;
    bonus = this.getCharacterAttribute(this.characterPlacement[attacker], 'Damage');
    if (bonus)
      dmgStr += ' + ' + bonus;
    var logStr = 'Rolling damage: ' + dmgStr + '\n';
    var damage = this.rollDice(this.parseRollString(dmgStr));
    logStr += damage[1] + '\n';
    logStr += 'Rolling attack(s): ' + toHitStr + '\n';
    var attack = [];
    var damages = [];
    for (var i = 0; i < attackees.length; i++) {
      
      var curattack = this.rollDice(this.parseRollString(adjustedToHitString[i] ?
          adjustedToHitString[i] : toHitStr));
      if (curattack[2][0][0] == 20) {
        logStr+= 'Critical HIT '+curattack[1]+'\n';
        curattack[0] = 100;
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

    /* Disable until we have support for reliable powers.
    if (usage == 'encounter' || usage == 'daily' || usage == 'recharge') {
      // TODO(kellis): Add support for recharge of powers and multi-use special powers.
      var evt = {
        type: 'power-consumed',
        character: attacker,
        power: power.name
      };
      this.sendEvent(evt);
    }
    */
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

  getCharacterAttribute: function(character, attribute) {
    var defenseAttrs = ['AC', 'Reflex', 'Fortitude', 'Will'];

    var value = parseInt(character.condition.stats[attribute]);
    if (!value) value = 0;
    if (defenseAttrs.indexOf(attribute) >= 0) {
      value += this.getCharacterAttribute(character, 'Defense');
    }
    if (character.condition.effects) {
      var effectRegex = new RegExp(attribute+'[ ]*([+-])[ ]*([0-9]*)');
      for (var i = 0; i < character.condition.effects.length; i++) {
        var effectMatch = effectRegex.exec(character.condition.effects[i]);
        if (effectMatch) {
          if (effectMatch[1] == '+')
            value += parseInt(effectMatch[2]);
          else
            value -= parseInt(effectMatch[2]);
        }
      }
    }
    return value;
  },

  hasEffect: function(character, effect) {
    if (character.condition.effects) {
      for (var i = 0; i < character.condition.effects.length; i++) {
        if (character.condition.effects[i] == effect)
          return true;
      }
    }
    return false;
  },

  computeMapCoordinatesDouble: function(e) {
    var x = e.clientX;
    var y = e.clientY;
    var element = this.canvas;
    while (element != document.body.parentNode) {
      x -= element.offsetLeft - element.scrollLeft;
      y -= element.offsetTop - element.scrollTop;
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

  drawHealthBar: function(ctx, hx, hy, hw, hh, character, isMonster, role) {
    // Health bars
    // Black border
    ctx.fillStyle = '#000';
    ctx.fillRect(hx - 1, hy - 1, hw + 2, hh + 2);
    // Interior
    var curHp = Number(character.condition.stats['Hit Points']);
    var maxHp = Number(character.source.stats['Hit Points']);
    var hpFraction = curHp / maxHp;
    var bloodyHp = Number(character.source.stats['Bloodied']);
    var isBloodied = (curHp <= bloodyHp);
    var isDying = (curHp <= 0);
    var temps = parseInt(character.condition.stats['Temps'] || 0);
    if (isMonster) {
      ctx.fillStyle = isBloodied ? '#f80' : '#0f0';
      if (role == 'dm') {
        if (hpFraction > 0)
          ctx.fillRect(hx, hy, Math.min(1, hpFraction) * hw, hh);
      } else {
        ctx.fillRect(hx, hy, isBloodied ? hw / 2 : hw, hh);
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(hx + hw / 2), hy, 1, hh);
    } else {
      ctx.fillStyle = isDying ? '#f00' : (isBloodied ? '#f80' : '#0f0');
      var total = bloodyHp + maxHp + temps;
      var healthRatio = (bloodyHp + curHp) / total;
      var healthWidth = Math.round(healthRatio * hw);
      ctx.fillRect(hx, hy, healthWidth, hh);
      if (temps > 0) {
        var tempRatio = temps / total;
        var tempWidth = Math.round(tempRatio * hw);
        if (healthWidth + tempWidth > hw)
          tempWidth = hw - healthWidth;
        ctx.fillStyle = '#ff0';
        ctx.fillRect(hx + healthWidth, hy, tempWidth, hh);
      }
      ctx.fillStyle = '#000';
      var bloodyRatio = bloodyHp / total;
      var DyingMarker = Math.round(bloodyRatio * hw);
      ctx.fillRect(hx + DyingMarker, hy, 1, hh);
      var BloodyMarker = Math.round(2 * bloodyRatio * hw);
      ctx.fillRect(hx + BloodyMarker, hy, 1, hh);
    }
  },

  drawTextInBounds: function(ctx, x_center, y, text, x_left, x_right, textColor, textHeight) {
    var maxWidth = Math.round(x_right - x_left);
    var textWidth;
    while ((textWidth = ctx.measureText(text).width) > maxWidth)
      text = text.substring(0, text.length - 1);
    var x = Math.round(Math.min(x_right - textWidth,
                                Math.max(x_left, x_center - textWidth / 2)));
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x, y - textHeight - 1, textWidth, textHeight + 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = textColor;
    ctx.fillText(text, x, y);
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

    // Mark selected character and indicate movement range.
    if (this.ui.selected != undefined) {
      var character = this.characterPlacement[this.ui.selected];
      var tw = this.viewport.tileSize;
      var x = baseX + (character.x - view.x1) * tw + tw / 2;
      var y = baseY + (character.y - view.y1) * tw + tw / 2;
      
      ctx.beginPath();
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = tw/32;
      ctx.arc(x, y, tw/4 + 2, 0, 2*Math.PI, true);
      ctx.stroke();
        
      // Movement overlay
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      var speed = parseInt(character.condition.stats['Speed'] || 0);
      for (var j = -speed; j <= speed; j++) {
        for (var k = -speed; k <= speed; k++) {
          if (Math.sqrt(j*j + k*k) <= (speed + 0.8))
            ctx.fillRect(baseX + (character.x + j - view.x1) * tw,
                         baseY + (character.y + k - view.y1) * tw,
                         tw,
                         tw);
        }
      }
    }

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
        var x = baseX + (character.x - view.x1) * tw + tw / 2;
        var y = baseY + (character.y - view.y1) * tw + tw / 2;
        for (var j = 0; j < targetFreq[index]; j++) {
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.arc(x, y, tw/3 + j*3, 0, 2*Math.PI, true);
          ctx.stroke();
        }
      }
    }

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

    var self = this;
    var mapX = function(x) {
      return baseX + (x - view.x1) * self.viewport.tileSize;
    };
    var mapY = function(y) {
      return baseY + (y - view.y1) * self.viewport.tileSize;
    };

    // Draw critter indicators including names and health bars.
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
      var tw = this.viewport.tileSize;
      var x = baseX + (character.x - view.x1) * tw + tw / 2;
      var y = baseY + (character.y - view.y1) * tw + tw / 2;
      ctx.arc(x, y, tw/4, 0, 2*Math.PI, true);
      ctx.fill();

      this.drawHealthBar(ctx,
                         Math.round(x - tw / 2 + 1 + 1 / 32 * tw),
                         Math.round(y - tw / 2 + 1 + 1 / 32 * tw),
                         Math.max(10, Math.round(tw - 2 - 2 / 32 * 2)),
                         Math.max(1, Math.round(2 / 32 * tw)),
                         character,
                         isMonster,
                         role);

      // Name
      var textHeight = Math.max(10, tw/3);
      ctx.font = textHeight + "px Arial";
      var x_bounds = [0, w - 1];
      for (var j = 0; j < this.characterPlacement.length; j++) {
        if (this.characterPlacement[i].x != this.characterPlacement[j].x && this.characterPlacement[j].y == this.characterPlacement[i].y) {
          if (this.characterPlacement[j].x < this.characterPlacement[i].x) {
            x_bounds[0] = Math.max(x_bounds[0], mapX((this.characterPlacement[j].x + character.x) / 2 + 0.5));
          } else {
            x_bounds[1] = Math.min(x_bounds[1], mapX((this.characterPlacement[j].x + character.x) / 2 + 0.5));
          }
        }
      }
      this.drawTextInBounds(ctx, x, Math.round(y - tw / 2 - tw / 32), name, x_bounds[0], x_bounds[1], isMonster ? '#f00' : '#00f', textHeight);
    }
  },

});

document.addEventListener('DOMContentLoaded', function() {
  load(document.body, function() {
    new dungeon.Client();
  });
});
