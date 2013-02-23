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

/**
 * Splits condition name and modifier.
 * @param {string} effect Name of the effect with optional modifier value.
 * @return {[string,numeric=]}  Split effect name and modifier.
 */
function parseEffect(effect) {
  var suffixRegex = /[ ]*([+-])[ ]*([0-9]*)$/;
  var separator = effect.regexIndexOf(suffixRegex);
  if (separator < 0)
    return [effect];
  return [effect.substring(0, separator),
          parseInt(effect.substring(separator).replace(/[ ]/g, ''))];
}

String.prototype.regexIndexOf = function(regex, startpos) {
    var indexOf = this.substring(startpos || 0).search(regex);
    return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf;
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
    this.objects = [];
    for (var i = 0; i < mapHeight; i++) {
      this.map.push([]);
      for (var j = 0; j < mapWidth; j++) {
        this.map[i].push(1);
      }
    }
    this.dispatchEvent('reset');
  },

  processEvent: function(eventData) {
    this.events.push(JSON.stringify(eventData));
    if (eventData.type == 'map') {
      this.map = eventData.map;
    } else if (eventData.type == 'change') {
      var diff = (eventData.size - 1) / 2;
      for (var i = 0; i < eventData.size; i++) {
        for (var j = 0; j < eventData.size; j++) {
          var x = eventData.x - diff + j;
          var y = eventData.y - diff + i;
          if (x >= 0 && y >= 0 && y < this.map.length && x < this.map[y].length)
            this.map[y][x] = eventData.value;
        }
      }
    } else if (eventData.type == 'add-object' || eventData.type == 'update-object') {
      var index;
      if (eventData.type == 'add-object') {
        index = this.objects.length;
        this.objects.push({
            x: 0,
            y: 0,
            tile: 0,
            w: 2,
            h: 2,
        });
      } else {
        index = eventData.index;
      }
      for (field in eventData.details) {
        this.objects[index][field] = eventData.details[field];
      }
    } else if (eventData.type == 'move') {
      if (this.characterPlacement[eventData.index]) {
        this.characterPlacement[eventData.index].x = eventData.x;
        this.characterPlacement[eventData.index].y = eventData.y;
      }
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
        this.processEvent(JSON.parse(gameEvents[i]));
      }
    } else if (eventData.type == 'load-map') {
      this.map = eventData.map;
      this.mapTiles = eventData.mapTiles;
      this.dispatchEvent('tile-added');
    } else if (eventData.type == 'log') {
      this.dispatchEvent('log', eventData.text);
    } else if (eventData.type == 'attack-result') {
      for (var i = 0; i < eventData.characters.length; i++) {
        var index = eventData.characters[i][0];
        var mods = eventData.characters[i][1];
        var condition = this.characterPlacement[index].condition;
        for (var j in mods) {
          // Modifying a stat such as HP or temps.
          if (j in condition.stats)
            condition.stats[j] = mods[j];
        }
        var effectMods = mods.effects;
        if (effectMods) {

          // Adding or removing a condition.
          var list = condition.effects;
          if (!list)
             list = condition.effects = [];
          for (var j = 0; j < effectMods.length; j++) {
            var found = false;
            // Effects with potency are are the form:
            // "Name +/- #"
            var effect = parseEffect(effectMods[j]);
            var effectRemoval = false;
            // A leading '-' indicates condition removal.
            if (effect[0].charAt(0) == '-') {
              effectRemoval == true;
              effect[0] = effect[0].substring(1, effect[0].length);
            }
            for (var k = 0; k < list.length; k++) {
              var e = parseEffect(list[k]);
              if (e[0] == effect[0]) {
                found = true;
                if (effectRemoval) {
                  list.splice(k, 1);
                  break;
                }
                // Typically effects of the same type are non-stacking.
                // Replace effect only if new effect is more potent.
                if (e[1] && effect[1] && effect[1] > e[1])
                  list[k] = effectMods[j];
                break;
              }
            }
            if (!found)
              list.push(effectMods[j]);
          }
        }
        this.dispatchEvent('character-updated', index);
      }
      this.dispatchEvent('log', eventData.log);
      this.dispatchEvent('banner-message', eventData.log);
      this.removeDeadMonsters();
    } else if (eventData.type == 'use-power') {
      if (eventData.power == 'healing-surge') {
        this.characterPlacement[eventData.character].condition.stats[
            'Hit Points'] = parseInt(this.characterPlacement[
            eventData.character].condition.stats['Hit Points']) +
            Math.floor(parseInt(this.characterPlacement[
                eventData.character].source.stats['Hit Points']) / 4);
        this.dispatchEvent('log', this.characterPlacement[eventData.character].name + ' uses a healing surge.\n\n');
        this.dispatchEvent('character-updated', eventData.character);
      } else if (eventData.power == 'Stat-tweak') {
        var character = this.characterPlacement[eventData.character]
        var characterStats = character.condition.stats;
        characterStats[eventData.data.stat] = eventData.data.tweak;
        this.dispatchEvent('log', character.name + '\'s ' + eventData.data.stat + ' has been tweaked.\n');
        this.dispatchEvent('character-updated', eventData.character);
        this.removeDeadMonsters();
      }
    } else if (eventData.type == 'power-consumed') {
      var character = this.characterPlacement[eventData.character];
      var targetPower = eventData.power;
      var powersList = character.condition.powers;
      for (var i = 0; i < powersList.length; i++) {
        if (powersList[i].name == targetPower) {
          powersList.splice(i, 1);
          this.dispatchEvent('character-updated', eventData.character);
          break;
        } 
      }
      // TODO(kellis): Add support for recharge of powers.
    } else if (eventData.type == 'banner-message') {
      this.dispatchEvent('banner-message', eventData.text);
    } else if (eventData.type == 'combat-state-change') {
      this.dispatchEvent('combat-state-changed', eventData.state);
    } else if (eventData.type == 'set-initiative-order') {
      this.dispatchEvent('initiative-order-changed', eventData.order, eventData.log);
    } else if (eventData.type == 'add-effects') {
      var character = this.characterPlacement[eventData.character];
      var effects = character.condition.effects;
      if (!effects)
        character.condition.effects = effects = [];
      for (var i = 0; i < eventData.effects.length; i++)
        effects.push(eventData.effects[i]);
      this.dispatchEvent('character-updated', eventData.character);
    } else if (eventData.type == 'remove-effect') {
      var character = this.characterPlacement[eventData.character];
      var effects = character.condition.effects;
      if (effects) {
        for (var i = 0; i < effects.length; i++) {
          if (effects[i] == eventData.effect) {
            effects.splice(i,1);
            this.dispatchEvent('character-updated', eventData.character);
            break;
          }
        }
      }
    } else if (eventData.type == 'set-character-turn') {
      this.dispatchEvent('set-character-turn', eventData.index);
    } else if (eventData.type == 'dm-attack-result') {
      // DM messages should not "replay"
      this.events.pop(); 
      this.dispatchEvent('dm-attack-result', eventData);
    } else if (eventData.type == 'load-powers') {
      this.dispatchEvent('load-powers', eventData);
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
        character.condition.stats = targetStats;
        character.condition.powers = source.powers.slice(0, source.powers.length);
        break;
      }
    }
    this.characterPlacement.push(character);
    this.dispatchEvent('character-added', character);
  },

  /**
   * Parses a roll string and returns an array of dice to roll.
   * @param {string} damage A roll string (i.e. 3d8 + 2d6 + 6).
   * @return {Array<[num, die]>} An array consisting of pairs of integers giving
   *     the number of dice to roll and the die face count. If num is 0 this
   *     corresponds to a constant value (i.e. the +6 above).
   */
  parseRollString: function(damage) {
    var dice = [];
    var val = 0;
    var num = 0;
    var mul = 1;
    for (var i = 0; i < damage.length; i++) {
      var ch = damage.charAt(i);
      if (ch >= '0' && ch <= '9') {
        val = 10*val + Number(ch);
      } else if (ch == 'd') {
        num = val;
        val = 0;
        mul = 1;
      } else if (ch == '-' && val == 0) {
        mul = -1;
      } else {
        if (val > 0)
          dice.push([num, mul * val]);
        mul = 1;
        val = 0;
        num = 0;
      }
    }
    dice.push([num, mul * val]);
    return dice;
  },

  /**
   * Remove dead monsters from play.
   */
  removeDeadMonsters: function() {
    for (var i = this.characterPlacement.length - 1; i >= 0; i--) {
      var character = this.characterPlacement[i];
      if (character.condition.stats['Hit Points'] <= 0 &&
          character.source.charClass == 'Monster') {
        this.dispatchEvent('log', character.name 
            + ' is no more.  RIP.\n');
        this.dispatchEvent('character-removed', character.name);
        this.characterPlacement.splice(i, 1);
      }
    }
  },

});

// If being included from NodeJS, add dungeon.Game to exports.
if (typeof exports == 'object' && exports) {
  exports.Game = dungeon.Game;
}
