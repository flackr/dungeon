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
      this.create(list[i]);
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
      power = new dungeon.Power(name);
      this.add(name, power);
    }
    return power;
  },

  /**
   * Forces all powers to reload.  Called when reverting all script
   * customizations.
   */
  reset: function() {
    this.powers_ = {};
    var list = this.customizedPowers;
    for (var i = 0; i < list.length; i++) {
      this.create(list[i]);
    }
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
      // TODO - store off index to make lookup easier.
      var name = this.activePower_.characterInfo_.name;
      var source = this.client_.getCharacterIndex(name);

      var usage = {
        source: source,
        targets: this.client_.getTargets(),
        power: this.activePower_.getName()
      };
      this.activePower_.phase_ = dungeon.Power.Phase.RESOLUTION;
      this.client_.dmAttackResult(usage);
    }
  },

  /**
   * Loads details description of player and monster powers.
   */
  onLoadPowers: function(eventData) {
    if (eventData.type == 'load-powers') {
      // TODO: Differentiate between a load replace and a load merge.
      //       Use timestamps in customization in the event of a merge.
      localStorage.setItem( 'dungeon-scripts', JSON.stringify(eventData.data));
    }
  },

  /**
   * Create a new power as a variant on another.
   * @param {name: string, script: Array.<string>} Description of the power.
   */
  create: function(data) {
    var power = new dungeon.Power(data.name);
    power.script_ = data.script.join('\n');
    this.add(data.name, power);
    return power;
  },

  client: function() {
    return this.client_;
  }
};

/**
 * Base class for D&D powers.  The base implementation is a generic
 * power, relying solely in information extracted from the character
 * or monster file.
 * @param {string} name The name of the power.
 */
dungeon.Power = function(name) {
  this.initialize(name);
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
   * Initializes a power.
   * @param {string} name of the power.
   */
  initialize: function(name) {
    this.name_ = name;
    this.script_ = null;
    this.requiresToHitRoll_ = false;
    this.damageList_ = [];
    this.onHitEffects_ = [];
    this.onMissEffects_ = [];
    this.generalEffects_ = [];
    this.reset = true;
  },

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
    var targetName = this.getName();
    for (var i = 0; i < list.length; i++) {
      if (list[i].name == targetName) {
        this.details_ = list[i];
        break;
      }
    }
    if (this.details_) {
      // Weapons are listed in the character file in order of preference, with
      // best weapon first.  At some point it would be nice to track which
      // weapon is actually equiped.
      var weapons = this.details_.weapons;
      this.weapon_ = weapons && weapons.length > 0 ? weapons[0] : null;

      // Initialize script for power.
      if (this.reset || ! ('script' in this.details_)) {
        var script = null;
        // First check scripts archived in local storage.  Scripts retrieved
        // from local storage are not shared with other clients.  Export powers
        // to a file and import in order to share across clients.
        var scripts = JSON.parse(localStorage.getItem('dungeon-scripts'));
        if (scripts) {
          var characterName = this.characterInfo_.name;
          var characterScripts = scripts[characterName];
          if (characterScripts) {
            var data = characterScripts[this.getName()];
            if (data)
              script = data.script;
          }
        }
        if (!script) {
          // Nothing archived.  Parse from description in character or monster file.
          try {
            script = dungeon.LanguageParser.generateScript(
                this.characterInfo_, this.getName());
          } catch(err) {
            console.log('Failure during natural language parsing of power ' + this.getName());
            console.log(err.message);
          }
        }
        this.details_.script = script ? script : '';
        this.reset = false;
      }
    }
    this.parseScript();
  },

  /**
   * Parses effects out of the script representation.
   */
  parseScript: function() {
    this.requiresToHitRoll_ = false;
    this.damageList_ = [];
    this.onHitEffects_ = [];
    this.onMissEffects_ = [];
    this.generalEffects_ = [];
    var activeList = null;
    var script = this.script_;
    if (!script && this.details_)
      script = this.details_['script'];
    if (script && script.length > 0) {
      try {
        var parts = script.split('\n');
        for (var i = 0; i < parts.length; i++) {
          var line = parts[i];
          if (line.length == 0)
            continue;
          if (line.indexOf('onHit:') == 0) {
            this.requiresToHitRoll_ = true;
            activeList = this.onHitEffects_;
            continue;
          }
          if (line.indexOf('onMiss:') == 0) {
            activeList = this.onMissEffects_;
            continue;
          }
          if (line.indexOf('effect:') == 0) {
            activeList = this.generalEffects_;
            continue;
          }
          // TODO - script should contain targetting info as well as onCrit.
          this.parseStatement(line, activeList);
        }
      } catch(err) {
        console.log('Failure interpreting script for power ' + this.getName());
        console.log(err.message);
      }
    }
  },

  /**
   * Parses a single expression in the script converting to a more convenient
   * object representation.
   */
  parseStatement: function(text, activeList) {
    text = text.trim();
    if (!activeList) {
      console.log('Warning: Parsing an expression outside of a group');
      return;
    }
    // Normal convension is to use the variable 'self' to refer to 'this' when
    // passing a reference to another function within Javascript; however,
    // 'self' is being used in the scripting language for the power to refer to
    // the character using the power. 
    var self = this.characterInfo_.name;
    var target = 'target';
    var Damage = function(target, roll, type) {
      return {
        effect: 'damage',
        target: target,
        roll: roll,
        type: type
      };
    }
    var Ongoing = function(v) {
      return {
        effect: 'condition',
        target: v.target,
        condition: v.type + v.roll
      };
    };
    var ApplyCondition = function(target, type) {
      var condition = {
        effect: 'condition',
        target: target,
        condition: type
      };
      var parts = type.split(' ');
      if (parts && parts[0] == 'marked') {
        condition.condition = type + ' [%s]'.replace('%s', self);
      }
      return condition;
    };
    var RemoveCondition = function(target, type) {
      return ApplyCondition(target, '-' + type);
    };
    var Heal = function(target, roll) {
      return {
        effect: 'heal',
        target: target,
        amount: roll,
      }
    };
    var HealingSurge = function(target) {
      return {
        effect: 'heal',
        target: target,
        amount: 'surge'
      };
    };
    var Move = function(target, type, distance) {
      return {
        effect: 'move',
        target: target,
        type: type,
        distance: distance
      };
    };
    var HalfDamage = function(target) {
      return {
        effect: 'halfdamage',
        target: target
      }
    };
    var power = this;
    var simplify = function(expr) {
      if (expr instanceof Object) {
        for (key in expr) {
          var value = expr[key];
          if (typeof value == 'string') {
            expr[key] = power.simplifyExpression(value);
          } else {
            expr[key] = simplify(value);
          }
        }
      }
      return expr;
    }
    var result = eval(text);
    if (result)
      result = simplify(result);
    activeList.push(result);
  },

  /**
   * Indicates if the power deal damage.
   * @return {boolean} True if the power deals damage to targets.
   */
  powerDealsDamage: function() {
    var findDamageEffect = function(list) {
      if (list) {
        for (var i = 0; i < list.length; i++) {
          var effect = list[i];
          if (effect['effect'] == 'damage')
            return true;
        }
      }
      return false;
    }
    return findDamageEffect(this.onHitEffects_) ||
      findDamageEffect(this.generalEffects_);
  },

  /**
   * Does the power require a roll to hit its target.
   * @return {boolean} True if a to-hit roll is required.
   */
  requiresToHitRoll: function() {
    return this.requiresToHitRoll_;
  },

  /**
   * Determines damage for attack.
   * @return {log: string, value: Number, max: Number}
   */
  rollDamage: function() {
    var results = [];
    var list = this.onHitEffects_;
    if (list) {
      for (var i = 0; i < list.length; i++) {
        var effect = list[i];
        if (effect['effect'] == 'damage') {
          var dmgStr = effect['roll'];
          var dmgType = effect['type'];
          var crit = null;
          if (i == 0 && this.weapon_) {
            dmgStr = this.weapon_.damage;
            crit = this.weapon_.crit;
          }
          if (dmgStr.indexOf('[W]') >= 0)
            dmgstr = this.getDamageString();
          var damage = this.rollDice(dmgStr);
          if (!crit)
            crit = damage.max;
          results.push({
            damageString: dmgStr,
            critString: crit,
            damageType: dmgType,
            rollString: damage.str,
            value: damage.value
          });
        }
      }
    }
    // cache value for computing 1/2 damage on a miss.
    this.damageRolls_ = results;
    return results;
  },

  /**
   * Generate to-hit rolls.
   * @return {Array.<{roll: number, 
   *                  base: number, 
   *                  attackBonus: number, 
   *                  adjustments: Array.<add: number, reason: string>>}
   */
  rollToHit: function(targets) {

    // Bonus to attack rolls.
    var baseAttack = parseInt(this.getToHit());
    var attackedStat = this.getAttackedStat();
    var attackBonus = this.getCharacterAttribute(this.characterInfo_, 'Attack');
    var attackBonusStr = '';
    attackBonus = attackBonus.adjusted;
  
    var results = [];
    for (var i = 0; i < targets.length; i++) {
      var targetInfo = this.client_.getCharacter(targets[i]);
      var adjustedAttack = baseAttack + attackBonus;
      var hitRoll = {
        attack: {
          roll: 1 + Math.floor(Math.random() * 20),
          base: baseAttack,
          adjusted: baseAttack,
          adjustments: [],
        },
        defense: this.getCharacterAttribute(targetInfo, attackedStat)
      };
      
      if (this.hasEffect(targetInfo, 'Grants Combat Advantage') ||
          this.hasEffect(this.characterInfo_, 'Combat Advantage')) {
        // TODO(kellis): Determine correct modifier for combat advantage based on creature and
        // circumstances.  Using default value of 2 for now. Also only applies to melee attacks.
        hitRoll.attack.adjustments.push({add: 2, reason: 'Combat Advantage'});
        adjustedAttack += 2;
      }
      if (attackBonus)
        hitRoll.attack.adjustments.push({add: attackBonus, reason: 'Attack'});

      // TODO: Add modifiers for target concealment, running, ...

      hitRoll.attack.adjusted = adjustedAttack;
      results.push(hitRoll);
    }
    return results;
  },


  // Effects -------------------------------------

  /**
   * Apply secondary effects that are are based on a to-hit roll.
   * @param{number} targetIndex  Reference index of the target.
   * @param{Array.<string>} log List of log messages for DM.
   * @param{Array.<Object>} results List of updates resulting from power.
   */
  applyOnHitEffects: function(targetIndex, log, results) {
    this.applyEffects(targetIndex, this.onHitEffects_, log, results, false);
  },

  /**
   * Apply secondary effects that are are based on scoring a critical
   *  with a to-hit roll.
   * @param{number} targetIndex  Reference index of the target.
   * @param{Array.<string>} log List of log messages for DM.
   * @param{Array.<Object>} results List of updates resulting from power.
   */
  applyOnCritEffects: function(target, log, results) {
    // Implement me.
  },

  /**
   * Apply effects that are not based on a to-hit roll.
   * @param{number} targetIndex  Reference index of the target.
   * @param{Array.<string>} log List of log messages for DM.
   * @param{Array.<Object>} results List of updates resulting from power.
   */
  applyGeneralEffects: function(targetIndex, log, results) {
    this.applyEffects(targetIndex, this.generalEffects_, log, results, true);
  },

  /**
   * Apply effects that are not based on a miss.
   * @param{number} targetIndex  Reference index of the target.
   * @param{Array.<string>} log List of log messages for DM.
   * @param{Array.<Object>} results List of updates resulting from power.
   */
  applyOnMissEffects: function(targetIndex, log, results) {
    this.applyEffects(targetIndex, this.onMissEffects_, log, results, true);
  },

  /**
   * Apply secondary effects that are are based on scoring a critical
   *  with a to-hit roll.
   * @param{number} targetIndex  Reference index of the target.
   * @param{Array.<string>} log List of log messages for DM.
   * @param{Array.<Object>} results List of updates resulting from power.
   * @param{boolean} includeDamageEffects Whether to include damage when resolving
   *     the effects.
   */
  applyEffects: function(targetIndex, effectsList, log, results, includeDamageEffects) {
    var targetInfo = this.client_.getCharacter(targetIndex);
    var targetName = targetInfo.name;
    var healing = 0;
    var damage = 0;
    for (var i = 0; i < effectsList.length; i++) {
      var effect = effectsList[i];
      if (effect['effect'] == 'damage' && !includeDamageEffects)
        continue;
      var targetting = effect['target'];
      if (targetting != 'target' && targetting != targetName)
        continue;
      // TODO: handle effects on self and allies.
      switch(effect['effect']) {
        case 'condition':
          log.push(effect['condition']);
          if (!results.effects)
            results.effects = [];
          results.effects.push(effect['condition']);
          break;
        case 'heal':
          var amount = effect['amount'];
          var hp = 0;
          if (amount == 'surge') {
            var maxHp = parseInt(targetInfo.source.stats['Hit Points']);
            hp = Math.floor(maxHp / 4);
            log.push('healing surge for ' + hp);
          } else {
            var roll = this.rollDice(amount);
            hp = roll.value;
            log.push('heal for ' + hp);
          }
          healing += hp;
          break;
        case 'damage':
          // Damage for effects that do not require a to-hit roll.
          // Damage on hit is already accounted for.
          var damageStr = effect['roll'];
          var damageType = effect['type'];
          var roll = this.rollDice(damageStr);
          var hp = roll.value;
          log.push(hp + ' ' + damageType + ' damage');
          damage += hp; 
          break;
        case 'move':
          log.push(effect['type'] + ' ' + effect['distance']);
          break;
        case 'halfdamage':
          // Half-damage does not apply to minions.
          var maxHp = parseInt(targetInfo.source.stats['Hit Points']);
          if (maxHp > 1 && this.damageRolls_ && this.damageRolls_.length > 0) {
            var roll = this.damageRolls_[0];
            var hp = Math.floor(roll.value / 2);
            damage += hp;
            log.push(hp + ' ' + roll.damageType + ' damage on miss');
          }
          break;
      }
    }
    // Stack all heals and damage at the end.
    if (healing) {
      var maxHp = parseInt(targetInfo.source.stats['Hit Points']);
      var currentHp = parseInt(targetInfo.condition.stats['Hit Points']);
      healing += currentHp;
      if (healing > maxHp)
        healing = maxHp;
      log.push(healing + '/' + maxHp + 'HP');
      results['Hit Points'] = healing;
    }
    if (damage) {
      var currentHp = parseInt(targetInfo.condition.stats['Hit Points']);
      hp += currentHp;
      var tempStr = targetInfo.condition.stats['Temps'];
      var temps = tempStr ? parseInt(tempStr) : 0;
      var newHp = parseInt(targetInfo.condition.stats['Hit Points']);
      var maxHp = parseInt(targetInfo.source.stats['Hit Points']);
      temps -= damage;
      if (temps < 0) {
        newHp += temps;
        temps = 0;
      }
      results['Hit Points'] = newHp;
      results['Temps'] = temps;
      log.push(newHp + '/' + maxHp + 'HP + ' + temps + ' temps');
    }
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
    var width = 1;
    var size = target.source.stats['Size'];
    switch(size) {
      case 'Large':
        width = 2;
        break;
      case 'Huge':
        width = 3;
        break;
      case 'Gargantuan':
        width = 4;
    }
    return position.x >= target.x && position.x < target.x + width &&
        position.y >= target.y && position.y < target.y + width;
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
   * Retrieves an attribute, which may be modified by conditions.
   * @param {Object} character  Character information.
   * @param {string} attribute  Name of the attribute.
   * @return {
   *   base: number,
   *   adjusted: number,
   *   adjustments: Array<add: number, reason: string>}
   */
  getCharacterAttribute: function(character, attribute) {
    var defenseAttrs = ['AC', 'Reflex', 'Fortitude', 'Will'];

    var value = parseInt(character.condition.stats[attribute]);
    if (!value) value = 0;
    var results = {
      base: value,
      adjusted: value,
      adjustments: []
    }
    if (defenseAttrs.indexOf(attribute) >= 0) {
      var defense = this.getCharacterAttribute(character, 'Defense').adjusted;
      if (defense) {
        value += defense;
        results.adjustments.push({add: defense, reason: 'Defense'});
      }
    }
    if (character.condition.effects) {
      var effectRegex = new RegExp(attribute+'[ ]*([+-])[ ]*([0-9]*)');
      for (var i = 0; i < character.condition.effects.length; i++) {
        var effectMatch = effectRegex.exec(character.condition.effects[i]);
        if (effectMatch) {
          var delta = parseInt(effectMatch[2]);
          if (effectMatch[1] == '-')
             delta = -delta;
          value += delta;
          results.adjustments.push({add: delta, reason: attribute});
        }
      }
    }
    results.adjusted = value;
    return results;
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

  getValue: function(key) {
    if (this.details_)
      return this.details_[key];
  },

  getActionType: function() {
    return this.getValue('Action Type');
  },

  getAttackType: function() {
    return this.getValue('Attack Type');
  },

  getDescription: function() {
    return this.getValue('Flavor');
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
    if (!dmgStr) {
      // Extract from power
      for (var i = 0; i < this.generalEffects_.length; i++) {
        var effect = this.generalEffects_[i];
        if (effect['effect'] == 'damage') {
          return effect['roll'];
        }
      }
    }
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

  getName: function() {
    return this.name_;
  },

  /**
   * Range of the attack.
   */
  getRange: function() {
    return this.getValue('Range');
  },

  /**
   * Threshold value for recharging a power.
   */
  getRecharge: function() {
    return this.getValue('Recharge');
  },

  /**
   * Retrieve the script for defining a power.
   */
  getScript: function() {
    var script = this.script_;
    if (!script && this.details_)
      script = this.details_['script'];
    return script;
  },

  /**
   * Conditions for limiting number of targets.  May be a maximum target count
   * within range, or specify friend versus foe.
   */
  getTargets: function() {
    if (this.details_)
      return this.details_['Targets'] || this.details_['Target'];
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
    var keywords = {};
    var tooltip = [];
    if (this.requiresToHitRoll())
      tooltip.push(this.getToHit() + ' versus ' + this.getAttackedStat() + '.');
    if (this.powerDealsDamage())
      tooltip.push(this.getDamageString() + ' damage.');
    // Fetch keywords of interest for tooltip.
    var extractEffects = function(list) {
      for (var i = 0; i < list.length; i++) {
        var effect = list[i];
        var name = effect['effect'];
        if (name == 'move')
          keywords[effect['type']] = true;
        else if (name == 'condition')
          keywords[effect['condition']] = true;
        else if (name == 'heal')
          keywords['heal'] = true;
      }
    };
    extractEffects(this.onHitEffects_);
    extractEffects(this.generalEffects_);
    for (var key in keywords)
      tooltip.push(key);
    // Does the power do half damage on a miss?
    for (var i = 0; i < this.onMissEffects_.length; i++) {
      var effect = this.onMissEffects_[i];
      if (effect['effect'] == 'halfdamage') {
        tooltip.push('half on miss');
        break;
      }
    }
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


  updateScript: function(newContent) {
    if (this.details_)
      this.details_['script'] = newContent;
  },

  resetScript: function() {
    this.reset = true;
  },

  // Random Goodness -----------------------------------  

  /**
   * Applies substitutions into an expression.
   *   '{atr}' is substrituted for the appropriate attribute modifier.
   */  
  simplifyExpression: function(expr) {
    var subs = {
      'str': 'Strength',
      'con': 'Constitution',
      'wis': 'Wisdom',
      'cha': 'Charisma',
      'int': 'Intelligence',
      'dex': 'Dexterity'  
    };
    // Substitute attribute modifiers.
    var matches = expr.match(/\{[a-z]+\}/g);
    if (matches) {
      for (var i = 0; i < matches.length; i++) {
        var match = matches[i];
        var key = match.substring(1, match.length-1);
        if (key in subs) {
          var value = this.characterInfo_.source.stats[subs[key] + ' modifier'];
          expr = expr.replace(match, value);
        }
      }
    }
    // TODO: handle other stats such as speed, ...
    return expr;
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

// ---------------------------- Specialized Powers ----------------------------


dungeon.Powers.prototype.customizedPowers = (function() {
/*
  // TODO - implement auto-self targetting.
  var Personal = {
    autoSelect: function() {
      return true;
    },

    selectionMatch: function(position, target) {
      return target.x == this.characterInfo_.x &&
          target.y == this.characterInfo_.y;
    },
  };
*/

  return [
    // TODO: self-targetting for second wind.
    {name: 'Second Wind',
     script: ['effect:',
              '  HealingSurge(target)']
    },
    // TODO: Stand, grab, bullrush, run...

  ];

})();


