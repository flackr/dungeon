/**
 * Dungeon common game class.
 */

var dungeon = {};

dungeon.Game = function() {
};

dungeon.Game.prototype = {
  initialize: function() {
    this.events = [];
    this.map = [];
    for (var i = 0; i < 20; i++) {
      this.map.push([]);
      for (var j = 0; j < 20; j++) {
        this.map[i].push(false);
      }
    }
    this.characters = [];
    this.characters.push({
      x: 1,
      y: 1,
      name: 'A',
      });
    this.characters.push({
      x: 5,
      y: 5,
      name: 'B',
      });
    this.characters.push({
      x: 8,
      y: 4,
      name: 'X',
      });
  },

  processEvent: function(eventData) {
    this.events.push(eventData);
    if (eventData.type == 'map') {
      this.map = eventData.map;
    } else if (eventData.type == 'change') {
      this.map[eventData.y][eventData.x] = eventData.value;
    } else if (eventData.type == 'move') {
      this.characters[eventData.index].x = eventData.x;
      this.characters[eventData.index].y = eventData.y;
    } else if (eventData.type == 'add-character') {
      this.characters.push(eventData.character);
    }
    this.update();
    return true;
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
