/**
 * Repository of powers.
 */
dungeon.Powers = function(client) {
  dungeon.EventSource.apply(this);
  this.initialize(client);
}

dungeon.Powers.prototype = {

  /**
   * Initialize the repository of powers.
   */
  initialize: function(client) {
    var self = this;
    dungeon.Powers.getInstance = function() {
      return self;
    }
    this.client_ = client;
    this.powers_ = {};
    this.activePower_ = null;
    // Automatically trigger the power on selection.
    client.addEventListener('power-selected', 
                            this.onPowerSelected.bind(this));
    // Resolve effect of using power.
    client.addEventListener('power-used',
                            this.onPowerUsed.bind(this));
    // Import powers represented in json format.
    client.addEventListener('load-powers',
                            this.onLoadPowers.bind(this));

    var list = this.customizedPowers;
    for (var i = 0; i < list.length; i++) {
      var name = list[i].name;
      var variant = list[i].variant;
      // TODO add support for alternate base class.
      this.create(name, variant);
    }
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


  /**
   * Loads details description of player and monster powers.
   */
  onLoadPowers: function() {
    console.log('ping');
  },

  /**
   * Create a new power as a variant on another.
   * @param {string} name  The name of the power.
   * @param {Object} variant Set of modifications to  the power.
   * @param {dungeon.Power} opt_base Optional base power from which this power
   *     is derived. 
   */
  create: function(name, variant, opt_base) {
    var power = new dungeon.Power({name: name}); 
    if (opt_base) {
      for (key in opt_base) {
        power[key] = opt_base[key];
      }
    }
    this.injectMethods(power, variant);
    this.add(name, power);
    return power;
  },

  /**
   * Overrides methods in a power. This is the means by which powers are
   * customized.
   */
  injectMethods: function(power, methods) {
    for (key in methods) {
      var addition = methods[key];
      if (addition instanceof Function)
        power[key] = addition;
      else
        this.injectMethods(power, addition);
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
   * @param {String|Object} character Name or description of the character
   *     using the power.
   */
  useBy: function(character) {
    this.phase_ = dungeon.Power.Phase.TARGET_SELECTION;
    var list;

    // Name of character instance.
    if (typeof character == 'string') {
      this.characterInfo_ = this.client_.getCharacterByName(character);
      list = this.characterInfo_.source.powers;
    } else {
      this.characterInfo_ = character;
      list = ('powers' in character) ?
          character.powers : character.source.powers;
    }

    // Fetch details of the power.  These details contain character specific
    // information such as resolved modifiers.
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
    this.applyPreTargettingEffects();
  },

  /**
   * Resolves the effect of using a power. Called after confirmation of
   * targets.
   */
  resolve: function(targets) {
    this.phase_ = dungeon.Power.Phase.RESOLUTION;

    // Results of using the power are fully resolved. By require DM 
    // repsonse before taking effect. 
    var result = {
      type: 'attack-result',  // TODO(kellis): Change to power-result
      characters: [],
      details: '', // Gory details about each roll.
      log: '', // Hit and miss messages (concise log).
      summary: '', // Who is hitting whom with what.
    };

    result.summary = this.logPowerUse(targets);

    if (this.powerDealsDamage()) {
      var damageRoll = this.rollDamage();
      result.details += damageRoll.log;
      var attackResults = null;
      if (this.requiresToHitRoll()) {
        attackResults = this.resolveToHit(targets, damageRoll);
        if (attackResults.log)
          result.details  += attackResults.log;
      }
      var attackedStat = this.getAttackedStat();
      if (attackResults)
         result.details += 'Attacking versus ' + attackedStat + '\n';
      for (var i = 0; i < targets.length; i++) {
        var target = targets[i].name;
        var hit = true; // Automatically hit if no roll required.
        var damage = damageRoll.value;
        if (attackResults) {
          var defStat = parseInt(this.getCharacterAttribute(
                                 targets[i], attackedStat));
          hit = (defStat <= attackResults.attack[i]);
          damage = attackResults.damage[i];
        }
        var damageModifier = this.getDamageModifier(targets[i]);
        damage += damageModifier;
        if (hit) {
          result.log += this.characterInfo_.name + ' hits ' + target
              + ' for ' + damage + ' damage.\n';
          if (damageModifier) {
             if (damageModifier < 0) {
               result.log +='[resisted ' + (-damageModifier) +
                   ' damage.]\n';
             } else {
                result.log += '[took ' + damageModifier +
                    ' extra damage.]\n';
             }
          }
          result.log += this.applyOnHitEffects(targets[i]);
        } else {
          // TODO: Handle Effect on miss.
          result.log += this.characterInfo_.name + ' misses ' +
              target;
          var missDamage = this.damageOnMiss(damage);
          if (missDamage && attackResults.attack[i] > 0 ) {
             // Non-crit-fail attack doing reduced damage.
             damage = missDamage;
             result.log += ', but still deals ' + missDamage + ' damage';
          } else {
            damage = 0;
          }
          result.log += '.\n';
          result.log += this.applyOnMissEffects(target);
        }
        if (damage) {
          var tempStr = targets[i].condition.stats['Temps'];
          var temps = tempStr ? parseInt(tempStr) : 0;
          var newhp = parseInt(targets[i].condition.stats['Hit Points']);
          temps -= damage;
          if (temps < 0) {
            newhp += temps;
            temps = 0;
          }
          var targetIndex = this.client_.getCharacterIndex(target);
          result.characters.push(
              [targetIndex,
               {'Hit Points': newhp,
                'Temps': temps}]);
          // TODO: Handle effect on hit.
        } // if damage
      } // for target

    } else {
      // Power does not deal damage.
      for (var j = 0; j < targets.length; j++) 
        result.log += this.applyOnHitEffects(targets[j], result);
    }
    this.client_.dmAttackResult(result); // TODO: Deferred result?
  },

  /**
   * Sends notification that power has been used on one or more targets.
   * @param {Array.<Object>} targets List of character info for targets.
   */
  logPowerUse: function(targets) {
    var targetNames = [];
    for (var i = 0; i < targets.length; i++)
      targetNames.push(targets[i].name);
    var message = this.characterInfo_.name + ' uses "' + this.data_.name +
      '" on ' + targetNames.join(',') + '.\n';
    this.client_.sendEvent({type: 'log', text: message});
    return message;
  },

  

  /**
   * Indicates if the power deal damage.
   * @return {boolean} True if the power deals damage to targets.
   */
  powerDealsDamage: function() {
    return this.getDamageString() != undefined;
  },

  /**
   * Does the power require a roll to hit its target.
   * @return {boolean} True if a to-hit roll is required.
   */
  requiresToHitRoll: function() {
    return this.getToHit() != undefined;
  },

  /**
   * Determines damage for attack.
   * @return {log: string, value: Number, max: Number}
   */
  rollDamage: function() {
    // Characters typically do damage based on weapon and monsters use 
    // "natural" weapons.
    var dmgStr = this.getDamageString();
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
   * Returns the damage on a miss.
   * @param{numeric} damageOnHit Damage roll for a non-crit hit.
   */
  damageOnMiss: function(damageOnHit) {
    return 0;
  },

  /**
   * Resolves attacks on targets.  Requires confirmation from DM.
   * @param {array.<Object>} Array of character info for targets.
   * @param {log: string, value: numeric, max: numeric} damage
   *     Result of damage roll. 
   */
  resolveToHit: function(targets, damage) {
    var toHitBase = this.getToHit();
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

    logStr = 'Rolling attack(s): ' + toHitStr + '\n';
    var attack = [];
    var damages = [];
    for (var i = 0; i < targets.length; i++) {
      var curattack = this.rollDice(adjustedToHitString[i] ?
          adjustedToHitString[i] : toHitStr);
      if (curattack.rolls[0][0] == 20) {
        logStr += 'Critical HIT '+ curattack.str +'\n';
        curattack.value = 100; // Hack to ensure a hit.
        // TODO: Add effect of magic weapons.
        damages.push(damage.max);
      } else if (curattack.rolls[0][0] == 1) {
        logStr += 'Critical FAIL '+ curattack.str +'\n';
        curattack.value = -100; // Hack to ensure a miss.
        damages.push(0);
      } else {
        logStr += curattack.str + '\n';
        damages.push(damage.value);
      }
      attack.push(curattack.value);
    }

    return {
      log: logStr,
      attack: attack,
      damage: damages
    };
  },

  /**
   * Apply an effect that triggers prior to targetting.
   * Includes effects that do not require targetting.
   * @return {string} Description of effects for logging.
   */
  applyPreTargettingEffects: function() {
    return '';
  },

  /**
   * Apply effects that triggers on a successful hit. May include
   * effecs on friendlies that auto-hit.
   * @param {Object} target CharacterInformation for the target.
   * @param {Object} result Object for storing effects.
   * @return {string} Description of effects for logging.
   */
  applyOnHitEffects: function(target, result) {
    return '';
  },

  /**
   * Apply effects that trigger on a miss.
   * @param {Object} target CharacterInformation for the target.
   * @param {Object} result Object for storing effects.
   * @return {string} Description of effects for logging.
   */
  applyOnMissEffects: function(target, result) {
    return '';
  },

  /**
   * Apply effects that trigger after all other effects are resolved.
   * @return {string} Description of effects for logging.
   */
  applyPostResolutionEffects: function() {
    return '';
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
   * Indicates if targets should be auto-selected.  Return true for personal
   * and close-burst powers. 
   */
  autoSelect: function() {
    return false;
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

  addCondition: function(target, condition, result) {
    var index = this.client_.getCharacterIndex(target.name);
    var list = result.characters;
    var entry = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i][0] == index) {
        entry = list[i];
        break;
      }
    }
    if (!entry) {
      entry = [index, {}];
      result.characters.push(entry);
    }
    if (!entry[1].effects)
      entry[1].effects = [];
    entry[1].effects.push(condition);
  },

  removeCondition: function(target, condition, result) {
    addCondition(target, '-' + condition, result);
  },

  /**
   * Heals target.
   * @param {string} target Name of the target.
   * @param {Object} result Structure for storing "attack" results.
   * @param {number} hp Number of hit points to add.
   */
  heal: function(target, result, hp) {
    var index = this.client_.getCharacterIndex(target.name);
    var list = result.characters;
    var entry = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i][0] == index) {
        entry = list[i];
        break;
      }
    }
    if (!entry) {
      entry = [index, {}];
      result.characters.push(entry);
    }
    var maxHp = parseInt(target.source.stats['Hit Points']);  
    var currentHp = parseInt(target.condition.stats['Hit Points']);
    var newHp = Math.min(maxHp, currentHp + hp);
    var healedHp = newHp - currentHp;
    entry[1]['Hit Points'] = newHp;
    return 'Healed ' + healedHp + ' (from ' + currentHp + ' to ' + newHp + ').';
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

  // Getters -------------------------------------------

  getActionType: function() {
    if (this.details_)
      return this.details_['Action Type'];
  },

  /**
   * Stat used to determine target toHit roll, which may depend on choice of
   * weapon for player attacks.
   */
  getAttackedStat: function() {
    if (this.weapon_)
      return this.weapon_.defense;
    if (this.details_)
      return this.details_.defense;
  },

  /**
   * Determines the damage string, including bonuses based on the condition of
   * for the attacker.  Does not include defensive bonuses.
   * @return {string} The damage.
   */
  getDamageString: function() {
    var dmgStr;
    if (this.weapon_)
      dmgStr = this.weapon_.damage;
    else if (this.details_)
      dmgStr = this.details_.damage;
    if (!dmgStr)
      return;
    // TODO: Might be better to defer including this bonus to allow for DM
    // modification.
    bonus = this.getCharacterAttribute(this.characterInfo_, 'Damage');
    if (bonus)
      dmgStr += ' + ' + bonus;
    return dmgStr;
  },

  /**
   * Determine situational damage modifier.
   * @param {Object} target Character info for target.
   * @return {numeric} Damage modifier.
   */
  getDamageModifier: function(target) {
    // TODO - Test for target vulnerabilities and resistances.
    return 0;
  },

  getEffectsTooltip: function() {
  },

  getName: function() {
    return this.data_.name;
  },

  /**
   * Range of the attack.
   */
  getRange: function() {
    if (this.details_)
      return this.details_['Range'];
  },

  /**
   * Threshold value for recharging a power.
   */
  getRecharge: function() {
    if (this.details_)
      return this.details_['Recharge'];
  },

  /**
   * Conditions for limiting number of targets.  May be a maximum target count
   * within range, or specify friend versus foe.
   */
  getTargets: function() {
    if (this.details_)
      return this.details_['Targets'];
  },

  /**
   * Base toHit modifier.
   */
  getToHit: function() {
    if (this.weapon_)
      return this.weapon_.toHit;
    if (this.details_)
      return this.details_.toHit;
  },

  /**
   * Short description of power.
   */
  getTooltip: function() {
    var tooltip = [];
    if (this.requiresToHitRoll())
      tooltip.push(this.getToHit() + ' versus ' + this.getAttackedStat() + '.');
    if (this.powerDealsDamage())
      tooltip.push(this.getDamageString() + ' damage.');
    if (this.getEffectsTooltip())
      tooltip.push(this.getEffectsTooltip());
    return tooltip.join(' ');
  },

  getTrigger: function() {
    if (this.details_)
      return this.details_['Trigger'];
  },

  getUsage: function() {
    if (this.details_)
      return this.details_['Power Usage'];
  },

  // Random Goodness -----------------------------------  

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

// ---------------------------- Specialized Powers ----------------------------

dungeon.Powers.prototype.customizedPowers = (function() {

  // Stone fist flurry of blows.
  var SFFoB = {
    getDamageString: function() {
      var modifier = this.characterInfo_.source.stats['Strength modifier'];
      var damage = 3 + parseInt(modifier); // TODO: +2 if switching targets.
      return "" + damage;
    }
  };

  // Open the gate of battle.
  var OtGoB = {
    getDamageModifier: function(target) {
      var modifier = dungeon.Power.prototype.getDamageModifier.apply(
          this, [target]);
      // 1D10 extra damage to uninjured target.
      var maxHp = parseInt(target.source.stats['Hit Points']);
      var currentHp = parseInt(target.condition.stats['Hit Points']);
      if (maxHp == currentHp)
        modifier += Math.floor(Math.random() * 10 + 1);
      return modifier; 
    }
  };

  // Furious assault.
  var FurAslt = {
    getDamageString: function() {
      return "1d8";  // actually 1[W].
    }
  };

  // Attacks that do half damage.
  var HalfDmg = {
    damageOnMiss: function(damageOnHit) {
      return Math.floor(damageOnHit/2);
    },
    getEffectsTooltip: function() {
      return '1/2 on miss.';
    }
  };

  var Push = function(n) {
    return {
      applyOnHitEffects: function(target) {
        // Not a persistant condition. Simply logging the effect is
        // sufficient for now to remind player and DM.
        var messageSuffix = (n == 1) ? ' space.\n' : ' spaces.\n' 
        return target.name + ' pushed ' + n + messageSuffix;
      },
      getEffectsTooltip: function() {
        return 'Push ' + n + '.';
      }
    };
  };

  var Personal = {
    autoSelect: function() {
      return true;
    },

    selectionMatch: function(position, target) {
      return target.x == this.characterInfo_.x &&
          target.y == this.characterInfo_.y;
    },
  };

  var Defense = function(n) {
    return {
      applyOnHitEffects: function(target, result) {
        this.addCondition(target, 'Defense+' + n, result);
        return target.name + ' has +' + n + ' to all defenses.';
      },
      getEffectsTooltip: function() {
        return '+' + n + ' to all defenses.';
      }
    };
  };

  var HealingSurge = {
    applyOnHitEffects: function(target, result) {
      // TODO: Track number of healing surges remaining.
      var maxHP = parseInt(target.source.stats['Hit Points']);
      return this.heal(target, result, Math.floor(maxHP / 4));
    },

    getEffectsTooltip: function() {
      return 'Restore 1/4 HP.';
    }
  };

  return [
    {name: 'Second Wind',
     variant: [HealingSurge, Personal]
    },
    {name: 'Healing Surge',
     variant: HealingSurge
    },
    {name: 'Stone Fist Flurry of Blows',
     variant: SFFoB
    },
    {name: 'Supreme Flurry',
     variant: SFFoB
    },
    {name: 'Furious Assault',
     variant: FurAslt
    },
    {name: 'Open the Gate of Battle',
     variant: OtGoB
    },
    {name: 'Masterful Spiral',
     variant: HalfDmg
    },
    {name: 'One Hundred Leaves',
     variant: [HalfDmg, Push(2)]
    },
    {name: 'Arc of the Flashing Storm',
     variant: Push(2)
    },
    {name: 'Centered Defense',
     variant: [Personal, Defense(2)]
    },
  ];

})();


