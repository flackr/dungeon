/**
 * Dungeon common game class.
 */

/**
 * Extends the |base| prototype with |derived| by merging the two objects into
 * a new object.
 */
function extend(base, derived) {
  var proto = {};
  for (var i in base)
    proto[i] = base[i];
  for (var i in derived)
    proto[i] = derived[i];
  return proto;
}

var dungeon = {};

dungeon.EventSource = function() {
  this.listeners = {};
};

dungeon.EventSource.prototype = {
  addEventListener: function(type, listener) {
    if (!this.listeners[type])
      this.listeners[type] = [];
    this.listeners[type].push(listener);
  },

  dispatchEvent: function(type /*, args... */) {
    if (!this.listeners[type])
      return;
    for (var i = this.listeners[type].length - 1; i >=0; i--) {
      this.listeners[type][i].apply(this,
          Array.prototype.slice.call(arguments, 1));
    }
  },

  removeEventListener: function(type, listener) {
    if (!this.listeners[type])
      return;
    for (var i = this.listeners[type].length - 1; i >=0; i--) {
      if (this.listeners[type][i] == listener)
        this.listeners[type].splice(i, 1);
    }
  },
};

dungeon.Game = function() {
  dungeon.EventSource.apply(this);
};

dungeon.Game.prototype = extend(dungeon.EventSource ,{
  initialize: function() {
    var mapWidth = 60;
    var mapHeight = 60;
    this.events = [];
    this.mapTiles = [
      {'src': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9wGAxUZHk8/2VoAAAAdaVRYdENvbW1lbnQAAAAAAENyZWF0ZWQgd2l0aCBHSU1QZC5lBwAAAA1JREFUCNdjYGBg+A8AAQQBAKTgrDEAAAAASUVORK5CYII='},
      {'src': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9wGAxUVG5PgYtkAAAAdaVRYdENvbW1lbnQAAAAAAENyZWF0ZWQgd2l0aCBHSU1QZC5lBwAAABdJREFUCNdj1FzG/vPnT6afP3+y8jMDADNeBsdmI5bVAAAAAElFTkSuQmCC'},
    ];
    this.map = [];
    for (var i = 0; i < mapHeight; i++) {
      this.map.push([]);
      for (var j = 0; j < mapWidth; j++) {
        this.map[i].push(1);
      }
    }
    this.characterRegistry = [];
    this.characterPlacement = [];
  },

  processEvent: function(eventData) {
    this.events.push(eventData);
    if (eventData.type == 'map') {
      this.map = eventData.map;
    } else if (eventData.type == 'change') {
      this.map[eventData.y][eventData.x] = eventData.value;
    } else if (eventData.type == 'move') {
      this.characterPlacement[eventData.index].x = eventData.x;
      this.characterPlacement[eventData.index].y = eventData.y;
    } else if (eventData.type == 'register-character-prototype') {
      // TODO(kellis): Check if character already registered.
      this.characterRegistry.push(eventData.character);
    } else if (eventData.type == 'add-character-instance') {
      this.createCharacterInstance(eventData.character);
    }
    this.update();
    return true;
  },

  /**
   * Creates an instance of a character on the combat map. Allows multiple
   * instances of the same character prototype by adding a numeric sufix
   * to the name to disambiguate.
   */
  createCharacterInstance: function(character) {
    var name = character.name;
    var candidateName = name;
    var index = 1;
    while(true) {
      var found = false;
      for (var i = 0; i < this.characterPlacement.length; i++) {
        if (this.characterPlacement[i].name == candidateName) {
          found = true;
          break;
        }   
      }
      if (!found)
        break;
      candidateName = name + ' [' + (++index) + ']';
    }
    character.name = candidateName;
    this.characterPlacement.push(character);
    // TODO(kellis): Add link back to prototype for populating initial state.
  },


  

  /**
   * This function is called when a change causes the current state to be stale
   * and can be overridden to redraw the game when something changes.
   * TODO(flackr): Eventually we should probably use events to trigger changes.
   */
  update: function() {
  },
});

// If being included from NodeJS, add dungeon.Game to exports.
if (typeof exports == 'object' && exports) {
  exports.Game = dungeon.Game;
}
