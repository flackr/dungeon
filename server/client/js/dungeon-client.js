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

    this.canvas = $('game-canvas');
    this.blockSize = 32;
    this.socket = io.connect('http://' + location.host);

    this.socket.on('e', this.receiveEvent.bind(this));
    this.canvas.addEventListener('click', this.onClick.bind(this));

    // Drag-n-drop of character files.
    var dropZone = $('sidebar-character-list');
    dropZone.addEventListener('dragover', this.onDragOver.bind(this));
    dropZone.addEventListener('drop', this.onDrop.bind(this));
    // Character file chooser
    $('files').addEventListener('change', this.onFileSelect.bind(this));

    // TODO(kellis): Drag-n-drop of a character from the sidebar onto the map.

    // Force a refresh.
    this.update();
  },

  sendEvent: function(eventData) {
    this.socket.emit('e', this.events.length, eventData);
  },

  receiveEvent: function(eventData) {
    // TODO(flackr): processEvent can return false if the event description is
    // not possible to execute given the current game state. If this happens it
    // is likely that the game state is incorrect.
    this.processEvent(eventData);
  },

  onClick: function(e) {
    var x = e.clientX;
    var y = e.clientY;
    var element = this.canvas;
    while (element != document.body) {
      x -= element.offsetLeft;
      y -= element.offsetTop;
      element = element.parentNode;
    }
    var evt = {
      x: Math.floor(x/this.blockSize),
      y: Math.floor(y/this.blockSize)
    };

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

  loadFiles: function(files) {
    if (files && files.length > 0) {
      for (var i = 0, f; f = files[i]; i++) {
        this.loadCharacter(f);
      }
    }
  },

  loadCharacter: function(file) {
    var reader = new FileReader();
    var self = this;
    reader.onload = function(evt) {
      var xmlContent = evt.target.result;
      self.parseCharacter(xmlContent);
    }
    reader.readAsText(file);
  },

  // TODO(kellis): Pull parser out into a separate class.

  parseCharacter: function(xmlContent) {
    var parser=new DOMParser();
    var xmlDoc = parser.parseFromString(xmlContent,"text/xml");
    // Relevant sections in the D&D character sheet.
    var characterSheet = xmlDoc.getElementsByTagName('CharacterSheet')[0];
    var details = characterSheet.getElementsByTagName('Details')[0];
    var ruleSet = xmlDoc.getElementsByTagName('RulesElementTally')[0];
    // Set of rules that apply to the character
    var rules = ruleSet.getElementsByTagName('RulesElement');

    var evt = {
       type: 'add-character',
       character: {
         name: this.extractBasicAttribute(details, 'name'),
         player: this.extractBasicAttribute(details, 'Player'),
         level: Number(this.extractBasicAttribute(details, 'Level')),
         charClass: this.extractRulesByType(rules, 'Class')[0],
       }
    };
    this.sendEvent(evt);
  },

  extractBasicAttribute: function(el, tag) {
    var matches = el.getElementsByTagName(tag);
    if (matches && matches.length == 1)
      return matches[0].textContent;
  },

  extractRulesByType: function(rules, targetType) {
    var results = [];
    for (var i = 0; i < rules.length; i++) {
       var r = rules[i];
       var type = r.getAttribute('type');
       if (type == targetType) {
         results.push(r.getAttribute('name'));
       }
    }
    return results;
  },

  update: function() {
    var ctx = this.canvas.getContext('2d');
    for (var i = 0; i < this.map.length; i++) {
      for (var j = 0; j < this.map[i].length; j++) {
        ctx.fillStyle = this.map[i][j] ? '#000' : '#ccc';
        ctx.fillRect(j * this.blockSize, i * this.blockSize, this.blockSize,
            this.blockSize);
      }
    }
    ctx.font = (this.blockSize - 5) + 'px Arial';
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
      ctx.fillText(name, character.x * this.blockSize, (character.y + 1) * this.blockSize);
    }

  },

  // TODO(kellis): Create separate character button class for an element in the character list.

  addCharacter: function(characterData) {
    var template = $('character-template');
    var element = template.cloneNode(true);
    element.id = '';
    var name = characterData.name;
    var player = characterData.player ? 
        '(' + characterData.player + ')' : '';
    this.characterList[name] = element;
    this.setCharacterAttribute(element, 'name', name);
    this.setCharacterAttribute(element, 'player', player);
    // TODO(kellis): Option to sensor info for the bad guys.
    this.setCharacterAttribute(element, 'level', characterData.level);
    this.setCharacterAttribute(element, 'class', characterData.charClass);
    $('sidebar-character-list').appendChild(element);
  },

  setCharacterAttribute: function(characterElement, attributeName, attributeValue) {
    var className = 'character-button-' + attributeName;
    if (attributeValue == undefined)
      attributeValue = '?';
    characterElement.getElementsByClassName(className)[0].textContent = attributeValue;
  },

  updateCharacter: function(characterData) {
     //TODO(kellis): Implement me.
  },

});

document.addEventListener('DOMContentLoaded', function() {
  new dungeon.Client();
});
