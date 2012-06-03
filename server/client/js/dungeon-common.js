/**
 * Dungeon common game class.
 */

var dungeon = {};

dungeon.Game = function() {
};

dungeon.Game.prototype = {
  initialize: function() {
    var mapWidth = 60;
    var mapHeight = 60;
    this.events = [];
    this.map = [];
    for (var i = 0; i < mapHeight; i++) {
      this.map.push([]);
      for (var j = 0; j < mapWidth; j++) {
        this.map[i].push(false);
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
};

// If being included from NodeJS, add dungeon.Game to exports.
if (typeof exports == 'object' && exports) {
  exports.Game = dungeon.Game;
}
