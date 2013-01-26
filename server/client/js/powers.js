/**
 * Repository of powers.
 */
dungeon.Powers = function(client) {
  dungeon.EventSource.apply(this);
  this.initialize(client);
  var self = this;
  dungeon.Powers.getInstance = function() {
    return self;
  }
}

dungeon.Powers.prototype = {

  /**
   * Initialize the repository of powers.
   */
  initialize: function(client) {
    this.client_ = client;
    this.powers_ = {};
    this.activePower_ = null;
    // Automatically trigger the power on selection.
    client.addEventListener('power-selected', 
                            this.onPowerSelected.bind(this));
    // Resolve effect of using power.
    client.addEventListener('power-used',
                            this.onPowerUsed.bind(this));
  },

  /**
   * Add or replace a power in the repository.
   * @param {string} name of the power.
   * @param {dungeon.Power} power The new or replacement power.
   */
  add: function(name, power) {
    this.powers_[name] = power;
  },

  /**
   * Retrieves a power by name.  If no matching power is found, a generic
   * power is created, using whatever information can be extracted from the
   * imported character file.
   * @param {string} name The name of the power.
   * @return {dungeon.Power} The matching power.
   */
  get: function(name) {
    var power = this.powers_[name];
    if (!power) {
      power = new dungeon.Power({name: name, 
                                 generic: true});
      this.add(name, power);
    }
    return power;
  },

  /**
   * Selecting a power triggers its use.  Note that powers requiring
   * additional user interaction prior to resolution can be cancelled.
   */
  onPowerSelected: function(characterName, powerName) {
    var power = this.get(powerName);
    power.useBy(characterName);
    this.activePower_ = power;
  },

  /**
   * Resolves effect of actively selected power.
   */
  onPowerUsed: function() {
    if (this.activePower_) {
      // Retrieve characte/monster info for selected targets from client.
      var targetIndicies = this.client_.getTargets();
      var targets = [];
      for(var i = 0;i < targetIndicies.length; i++) {
        targets.push(this.client_.getCharacter(targetIndicies[i]));
      }
      this.activePower_.resolve(targets);
    }
  },

  client: function() {
    return this.client_;
  }
};

/**
 * Base class for D&D powers.  The base implementation is a generic
 * power, relying solely in information extracted from the character
 * or monster file.
 */
dungeon.Power = function(data) {
  this.data_ = data;
  var repository = dungeon.Powers.getInstance();
  this.client_ = repository.client();
};

dungeon.Power.Phase = { 
  TARGET_SELECTION: 'target-selection',
  RESOLUTION: 'resolution',
  RESET: 'reset'
};

/**
 * Generic representation of a power.  
 */
dungeon.Power.prototype = {

  /**
   * Indicates the current state of progress in using a power.  Typically,
   * powers start at a target selection phase and then proceed to resolution
   * and DM confirmation.
   */
  getPhase: function() {
     return this.phase_;
  },

  /**
   * Call to initiate use of the power.  Typically starts with target
   * selection.  Override to perform specialized actions.  Only one power
   * may be in use at a time per client.
   * @param {String} character Name of the character using the power.
   */
  useBy: function(characterName) {
    this.phase_ = dungeon.Power.Phase.TARGET_SELECTION;
    this.characterInfo_ = this.client_.getCharacterByName(characterName);
    // Fetch details of the power.  These details contain character specific
    // information such as resolved modifiers.
    var list = this.characterInfo_.source.powers;
    for (var i = 0; i < list.length; i++) {
      if (list[i].name == this.data_.name) {
        this.details_ = list[i];
        break;
      }
    }
    if (this.details_) {
      // Make assumption that first weapon in list is best.
      // TODO(kellis): Check assumption.
      // TODO(kellis): Track which weapon is equiped?
      var weapons = this.details_.weapons;
      this.weapon_ = weapons && weapons.length > 0 ? weapons[0] : null;
    }
  },

  /**
   * Resolves the effect of using a power. Called after confirmation of
   * targets.
   */
  resolve: function(targets) {
    this.phase_ = dungeon.Power.Phase.RESOLUTION;
    this.broadcastPowerUse(targets);

    var results = null;
    var log = '';
    var damage = this.rollDamage(); // TODO: check if this power does damage.
    if (this.requiresToHitRoll()) {
      results = this.resolveToHit(targets, damage);
      if (results.log)
        log += results.log;

      // TODO: Cleanup method signature.
      var powerInfo = this.weapon_ ? this.weapon_ : this.details_;
      var attacker = this.client_.getCharacterIndex(this.characterInfo_.name);
      var attackees = [];
      for (var i = 0; i < targets.length; i++) {
        attackees[i] = this.client_.getCharacterIndex(targets[i].name);
      }
      var attack = results.attack;
      var damage = results.damage;
      this.client_.dmAttackResult(attacker, attackees, powerInfo, attack, damage, log);

    } else {
      // resolve auto-hits.
    }
    
  },

  /**
   * Sends notification that power has been used on one or more targets.
   * @param {Array.<Object>} targets List of character info for targets.
   */
  broadcastPowerUse: function(targets) {
    var targetNames = [];
    for (var i = 0; i < targets.length; i++)
      targetNames.push(targets[i].name);
    var message = this.characterInfo_.name + ' uses "' + this.data_.name +
      '" on ' + targetNames.join(',') + '.';
    this.client_.sendEvent({type: 'log', text: message});
  },

  /**
   * Does the power require a roll to hit its target.
   * @return {boolean} True if a to-hit roll is required.
   */
  requiresToHitRoll: function() {
    return true; // TODO(kevers): implement me.
  },

  /**
   * Determines damage for attack.
   * @return {log: string, value: Number, max: Number}
   */
  rollDamage: function() {
    // Characters typically do damage based on weapon and monsters use 
    // "natural" weapons.
    var dmgStr = this.weapon_ ? this.weapon_.damage : this.details_.damage;
    bonus = this.getCharacterAttribute(this.characterInfo_, 'Damage');
    if (bonus)
      dmgStr += ' + ' + bonus;
    var damage = this.rollDice(dmgStr);
    var logStr = 'Rolling damage: ' + dmgStr + '\n';
    logStr += damage.str + '\n';

    return {
      log: logStr,
      value: damage.value,
      max: damage.max
    };
  },

  /**
   * Resolves attacks on targets.  Requires confirmation from DM.
   * @param {array.<Object>} Array of character info for targets.
   * @param {log: string, value: numeric, max: numeric} damage
   *     Result of damage roll. 
   */
  resolveToHit: function(targets, damage) {
    var toHitBase = this.weapon_ ? this.weapon_.toHit : this.details_.toHit;
    var toHitStr = '1d20 + ' + toHitBase;

    // Allow effect bonus for attacker.
    var bonus = this.getCharacterAttribute(this.characterInfo_, 'Attack');
    if (bonus)
      toHitStr += ' + ' + bonus;

    // Determine toHit adjustments for each target.
    var adjustedToHitString = [];
    for (var i = 0; i < targets.length; i++) {
      if (this.hasEffect(targets[i], 'Grants Combat Advantage')) {
        // TODO(kellis): Not quite generic enough as in some cases the bonus can be higher for
        // having combat advantage.  Keeping it separate from Defense modifier to more closely
        // reflect game mechanics and to be more visible.
        adjustedToHitString[i] = toHitStr + ' + 2';
      }
      // TODO: Add modifiers for target concealment, running, ...
    }

    logStr = damage.log + 'Rolling attack(s): ' + toHitStr + '\n';
    var attack = [];
    var damages = [];
    for (var i = 0; i < targets.length; i++) {
      var curattack = this.rollDice(adjustedToHitString[i] ?
          adjustedToHitString[i] : toHitStr);
      if (curattack.rolls[0][0] == 20) {
        logStr += 'Critical HIT '+ curattack.str +'\n';
        curattack.value = 100; // Hack to ensure a hit.
        // TODO: Add effect of magic weapons.
        damages.push(damge.max);
      } else {
        logStr += curattack.str + '\n';
        damages.push(damage.value);
      }
      // TODO: handle crit fails.
      attack.push(curattack.value);
    }

    return {
      log: logStr,
      attack: attack,
      damage: damages
    };
  },

  toCharacterIndices: function(targets) {
    var indices = [];
    for(var i = 0; i < targets.length; i++) {
      indices[i] = this.client_.getCharacterIndex(targets[i].name);
    }
    return indices;
  },

  // DM confirmation of effect.
  confirm: function() {
    this.phase_ = dungeon.Power.Phase.RESET;
  },

  // DM or player cancelled a power.
  cancel: function() {
    this.phase_ = dungeon.Power.Phase.RESET;
  },

  /**
   * Indicates if the target matches the selection criteria.  Generic powers
   * require explicitly clicking/tapping on each target. Burst and blast
   * powers can use proximity to determine a selection match.
   * @param {{x: integer, y:integer}} position  Reference location for
   *    determining a match.  This position is determined from the mouse
   *    or touch event that triggered the selection update.
   * @param {Object} target Character info for the target.
   */
  selectionMatch: function(position, target) {
    return position.x == target.x && position.y == target.y;
  },

  /**
   * Indicates if the list of selected targets should be reset prior to each
   * selection test.  Generic powers require an explicit click on each target
   * accumulating the results.  Blast, burst or single target powers should
   * auto-reset.
   * @return {boolean} True if the selection auto-resets prior to a set of 
   *     selection match tests.
   */
  resetSelectionOnUpdate: function() {
    return false;
  },

  /**
   * Indicates if the selection should auto-update on mouse hover. Generic
   * powers require an explicit click/tap on each target.  Burst or blast
   * powers should auto-update the selected targets.
   * @return {boolean} True of the selection is auto-updated on a mouse hover.
   */
  selectOnMove: function() {
    return false;
  },

  /**
   * Retrieves an attribute, which may be modified by conditions
   * for a character.
   * @param {Object} character  Character inforation.
   * @param {string} attribute  Name of the attribute.
   * @param {Number} Adjusted value of the attribute.
   */
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

  /**
   * Determines if a condition is in effect.
   */
  hasEffect: function(character, effect) {
    if (character.condition.effects) {
      for (var i = 0; i < character.condition.effects.length; i++) {
        if (character.condition.effects[i] == effect)
          return true;
      }
    }
    return false;
  },

  /**
   * Resolves a dice roll.
   * @param {string} rollStr Description of the die roll (e.g. "2D6+5")
   * @return {
   *   str: string,
   *   value: numeric,
   *   max: numeric,
   *   rolls: Array.<numeric>
   * }
   */
  rollDice: function(rollStr) {
    var rollArray = this.client_.parseRollString(rollStr);
    var total = 0;
    var max = 0;
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
        max += rollArray[i][0] * rollArray[i][1];
        diceRolls.push(curDieRolls);
        rollstr += ')';
      } else {
        rollstr += val;
        total += val;
        max += val;
      }
    }
    rollstr += ' = ' + total;
    return {
      str: rollstr,
      value: total,
      max: max,
      rolls: diceRolls
    };
  },
  
};

