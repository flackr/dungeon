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

dungeon.Game.prototype = extend(dungeon.EventSource.prototype, {
  initialize: function() {
    this.reset();
  },

  reset: function() {
    this.events = [];
    this.characterRegistry = [];
    this.characterPlacement = [];
    this.mapTiles = [
      {'src': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9wGAxUZHk8/2VoAAAAdaVRYdENvbW1lbnQAAAAAAENyZWF0ZWQgd2l0aCBHSU1QZC5lBwAAAA1JREFUCNdjYGBg+A8AAQQBAKTgrDEAAAAASUVORK5CYII='},
      {'src': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9wGAxUVG5PgYtkAAAAdaVRYdENvbW1lbnQAAAAAAENyZWF0ZWQgd2l0aCBHSU1QZC5lBwAAABdJREFUCNdj1FzG/vPnT6afP3+y8jMDADNeBsdmI5bVAAAAAElFTkSuQmCC'},
    ];
    var mapWidth = 60;
    var mapHeight = 60;
    this.map = [];
    for (var i = 0; i < mapHeight; i++) {
      this.map.push([]);
      for (var j = 0; j < mapWidth; j++) {
        this.map[i].push(1);
      }
    }
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
      this.dispatchEvent('character-loaded', eventData.character);
    } else if (eventData.type == 'add-character-instance') {
      this.createCharacterInstance(eventData.character);
    } else if (eventData.type == 'add-tile') {
      this.mapTiles.push({'src': eventData.image});
      this.dispatchEvent('tile-added', this.mapTiles.length - 1);
    } else if (eventData.type == 'undo') {
      var gameEvents = this.events;
      this.events = [];
      this.reset();
      for (var i = 0; i < gameEvents.length - 2; i++) {
        this.processEvent(gameEvents[i]);
      }
    }
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

    // Add link back to prototype for accessing powers and stats. The
    // source info is cloned to store the current condition of the
    // charcter. As the character takes damage or uses powers, the current
    // condition can be freely modified while still having access to
    // the original state.
    for (var i = 0; i < this.characterRegistry.length; i++) {
      if (this.characterRegistry[i].name == name) {
        var source = this.characterRegistry[i];
        character.source = source;
        character.condition = {};
        var sourceStats = source.stats;
        var targetStats = {};
        for (key in character.source.stats)
           targetStats[key] = sourceStats[key];
        var targetPowers = source.powers.slice(0, source.powers.length);
        break;
      }
    }
    this.characterPlacement.push(character);
  },

});

// If being included from NodeJS, add dungeon.Game to exports.
if (typeof exports == 'object' && exports) {
  exports.Game = dungeon.Game;
}
