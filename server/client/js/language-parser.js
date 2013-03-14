if (!window.dungeon)
  window.dungeon = {};

/**
 * Natural language parser for extracting rules from a plain
 * text description.  The rules are converted to scripts,
 * which automate as much of the bookkeeping as possible.
 * Achieving 100% rule extraction is not a requirement, nor
 * is it even a realistic expectation.  The goal is to make
 * applying the rules easier for the DM and players alike
 * by taking care of the simple stuff.
 */
dungeon.LanguageParser = (function() {

  /**
   * Detailed description of the imported player or monster.
   */
  var characterInfo_;

  /**
   * Details of the power.
   */
  var power_;

  // Convert keywords to a canonical form.  For the most part,
  // noun-verb agreement and verb tense are not critical to
  // extracting the underlying meaning when using a very
  // restrictive vocabulary to express the rules. Use of a 
  // standardized form greatly reduces the number and complexity
  // of rules.
  var variants = {
    // Canonical form for moves.
    'pushed': 'push',
    'pushes': 'push',
    'pulled': 'pull',
    'pulls': 'pull',
    'slid': 'slide',
    'slides': 'slide',
    'shifted': 'shift',
    'shifts': 'shift',
    'teleported': 'teleport',
    'teleports': 'teleport',
    'flies': 'fly',
    // Canonical form for range.
    'squares': 'square',
     // Cononical form for conditions.
    'grab': 'grabbed',
    'grabs': 'grabbed',
    'concealment': 'concealed',
    'invisibility': 'invisible',
    // Miscellanous
    'regains': 'regain',
    'equals': 'equal',
    '\u2013': '-', // en dash
    '\u2014': '-', // em dash
  };

  // Grouping of keywords by type.  Most rule apply to types to
  // cut down on repetitiveness.
  var primitives = {};

  function addPrimitives(category, words) {
    var parts = words.split(' ');
    for(var i = 0; i < parts.length; i++) {
      primitives[parts[i]] = category;
    }
  }

  addPrimitives('_ATTRIBUTE_', 
                'charisma constitution dexterity intelligence strength wisdom');
  addPrimitives('_STAT_', 'speed');
  addPrimitives('_SKILL_',
                'acrobatics arcana athletics bluff diplomacy dungeoneeering ' +
                'endurance heal insight intimidate nature perception ' +
                'religion stealth streetwise thievery');
  addPrimitives('_OPERATOR_', '+ -');
  addPrimitives('_DAMAGE_TYPE_', 
                'acid cold divine fire force lightning necrotic thunder ' +
                'poison psychic radiant');
  addPrimitives('_MOVE_TYPE_',
                'charge fly jump move push pull run shift slide teleport');
  addPrimitives('_CONDITION_',
               'blinded bloodied concealed cursed dazed dominated grabbed ' +
               'immobilized invisible marked slowed weakened');
  addPrimitives('_ADJUSTMENT_', 'additional bonus extra penalty');
  addPrimitives('_DEFENSE_', 'ac defense fortitude reflex will');
  addPrimitives('_PROHIBIT_', 'can\'t cannot');
  
  // Joiners.  Cadidates for dumping.
  addPrimitives('_COMBINE_', ', and plus');

  addPrimitives('_EQUATE_', 'equal');
 
  // Empty tokens.
  primitives[''] = '_FILLER_';
  primitives[' '] = '_FILLER_';

/*
  addPrimitives('_FILLER_',
    '': '_FILLER_',
    ' ': '_FILLER_',
    'the': '_FILLER_',
    'a': '_FILLER_',
    'is': '_FILLER_',
    'becomes': '_FILLER_',
*/
    
  // Regular expressions for extracting numeric content.
  var patterns = {
    '_NUMBER_': /[0-9]+/,
    '_ROLL_': /[0-9]+d[0-9]+/,
    '_WEAPON_DAMGE_': /[0-9]*\[[wW]\]/
  };

  // Monster or class names that has one or more synonyms.
  var nameSynonyms = {
    'mage': ['magus'],
    'magus': ['mage']
  };

  /**
   * Rule repository
   */
  var rulesets = [];

  /**
   * Adds a single rule to the ruleset.
   * @param {number} priority  The relative priority of the rule.
   *    Rules with a lower numeric value are applied first.
   * @param {string} sequence of words or token keys.
   * @param {string} key The key to assign to the resolved token.
   * @param {string] value Optional value to assign to the token.
   *     If omitted, the value is set to the sequence.
   * @param {boolean} evaluate Optional flag indicating if the 
   *     value is to be evaluated.
   */
  function insertRule(priority, sequence, key, value, evaluate) {
    var parts = sequence.split(' ');
    var r = rulesets[priority];
    if (!r)
      r = rulesets[priority] = {};
    for (var i = 0;  i < parts.length; i++) {
      var part = parts[i];
      if (part in r) {
        r = r[part];
        continue;
      }
      r = r[part] = {};
    }
    if (!value)
      value = sequence;
    if (r['_terminal_']) {
      console.log('WARNING: duplicate rule definition for ' + sequence + '.');
    }

    r = r['_terminal_'] = {type: key, value: value};
    if (evaluate)
      r.evaluate = true;
  }


  // --------------------------------------------------
  // Rules grouped by precedence.

  // The higest priority rules convert numeric expressions,
  // into a canonical form. Also 'or' logic is applied here
  // in order to take precedence over '+' when computing damage
  // based on a choice of multiple modifiers.  The 'or' logic
  // uses the highest modifier in this case.

  // Many player powers have improved mechanics at higher levels.
  // Accept or reject replacement rules based on level.
  insertRule(0, 'level _NUMERIC_ :', '_LEVEL_POWER_UP_', 'isReplacement(T[1])', true);

  // Treat die rolls as numeric expressions.
  insertRule(0, '_ROLL_', '_NUMERIC_', 'T[0]');
  insertRule(0, '_WEAPON_DAMGE_', '_NUMERIC_', '"T[0]".replace("w", "W")', true);

  // Relax categorization of numeric type to simplify rules for
  // combining expressions.
  insertRule(0, '_NUMBER_', '_NUMERIC_', 'T[0]');

  // Resolve "# or #" before "# + #" to deal with the pattern:
  // "roll + A modifier or B modifier damage".  In theory the
  // choice of which modifier to apply should be made at character
  // creation time.  In reality, it'll be whichever attribute is
  // higher.
  insertRule(0, '_NUMERIC_ or _NUMERIC_', '_NUMERIC_',  'Math.max(T[0],T[2])', true);
  insertRule(0, '_CONDITION_ or _CONDITION_', '_CONDITION_', '[T[0], T[2]]');

  // Resolve attribute modifications immediately based on player stats.
  insertRule(0, '_ATTRIBUTE_ modifier', '_MODIFIER_', 'T[0]');
  insertRule(0, 'your _MODIFIER_', '_MODIFIER_', 'T[1]');
  insertRule(0, '_MODIFIER_', '_NUMERIC_', 'getModifier("T[0]")', true);

  // Extracts numeric value for stat or modifier based on character info.
  insertRule(0, '_STAT_', '_NUMERIC_', '"[" + "T[0]" + "]"', true);
  insertRule(0, 'your _STAT_', '_STAT_', 'T[1]');

  // Apply rules which combine numeric expressions before resolving
  // factors like damage type.  
  insertRule(1, '_NUMERIC_ _OPERATOR_ _NUMERIC_', '_NUMERIC_',
      'simplifyNumerics("T[0]T[1]T[2]")', true);

  // Apply rules that construct compound nouns.
  insertRule(1, 'all defenses', '_DEFENSE_', 'defense');
  insertRule(1, 'attacks against _ACTOR_ have combat advantage', '_CONDITION_',
      'GrantsCombatAdvantage');
  insertRule(1, 'attack rolls', '_ATTACK_ROLLS_');
  insertRule(1, 'can spend a healing surge', '_HEALING_SURGE_');
  insertRule(1, '_DAMAGE_TYPE_ _COMBINE_ _DAMAGE_TYPE_' ,'_DAMAGE_TYPE_', 'T[0]/T[2]');
  // TODO: verify that _NUMERIC_ == 0 when applying following rule.
  insertRule(1, 'drops to _NUMERIC_ _HIT_POINTS_', '_WHEN_', 'unconscious');
  insertRule(1, 'end of', '_WHEN_', 'end');
  insertRule(1, '_EQUATE_ to', '_EQUATE_', 'equal');
  insertRule(1, 'is _EQUATE_', '_EQUATE_', 'equal');
  insertRule(1, 'gains combat advantage', '_CONDITION_', 'Combat Advantage');
  insertRule(1, 'grants combat advantage', '_CONDITION_', 'Grants Combat Advantage');
  insertRule(1, 'half damage', '_HALF_DAMAGE_');
  insertRule(1, 'healing surge', '_HEALING_SURGE_');
  insertRule(1, 'hit points', '_HIT_POINTS_');
  insertRule(1, 'may not', '_PROHIBIT_');
  insertRule(1, 'melee basic attack', '_BASIC_ATTACK_', 'melee');
  insertRule(1, 'next turn', '_NEXT_TURN_');
  insertRule(1, 'power _ADJUSTMENT_', '_ADJUSTMENT_', 'T[1]');
  insertRule(1, '_PROHIBIT_ benefit from', '_NEGATE_');
  insertRule(1, 'range basic attack', '_BASIC_ATTACK_', 'range');
  insertRule(1, 'resistance to', 'resist');
  insertRule(1, 'save ends', '_DURATION_', 'save');
  insertRule(1, 'saving throw', '_SAVING_THROW_');
  insertRule(1, 'saving throws', '_SAVING_THROW_');
  insertRule(1, 'start of', '_WHEN_', 'start');

  // At this stage, all rules for combining numeric expressions
  // have been applied.  Now the numeric expressions can be combined
  // with surrounding words that determine the context such as applying
  // damage, expressing a distance, or applying a condition. 

  // Damage calculations.
  insertRule(2, '_NUMERIC_ damage', '_DAMAGE_', 
      '{amount: "T[0]", type: "untyped"}', true);
  insertRule(2, '_NUMERIC_ _DAMAGE_TYPE_ damage', '_DAMAGE_',
      '{amount: "T[0]", type: "T[1]"}', true);
  insertRule(2, '_NUMERIC_ _COMBINE_ _DAMAGE_TYPE_ damage', '_DAMAGE_',
      '[{amount: "T[0]", type: "untyped"},' + 
      '{amount: "T[0]", type: "T[3]"}]', true);
  insertRule(2, 'ongoing _DAMAGE_', '_ONGOING_DAMAGE_', 'T[1]', true);

  // Conditions.
  insertRule(2, 'falls prone', '_CONDITION_', 'prone');
  insertRule(2, 'knocked prone', '_CONDITION_', 'prone');
  insertRule(2, 'knocks it prone', '_CONDITION_', 'prone');
  insertRule(2, 'knock _ACTOR_ prone', '_CONDITION_', 'prone');
  insertRule(2, '_PROHIBIT_ _MOVE_TYPE_', '_CONDITION_', 'cannot-T[1]');
  insertRule(2, '_NEGATE_ _CONDITION_', '_CONDITION_', 'negate-T[1]');
  insertRule(2, 'no longer _CONDITION_', '_REMOVE_CONDITION_', 'T[2]');
  // Add who

  // Attack/defense/skill/... modifiers.
  insertRule(2, '_ADJUSTMENT_ _ATTACK_ROLLS_ _EQUATE_ _NUMERIC_', '_CONDITION_',
      'sanitizeAdjustment("Attack", "T[0]", "T[3]")', true);
  insertRule(2, '_ADJUSTMENT_ _DEFENSE_ _EQUATE_ _NUMERIC_', '_CONDITION_',
      'sanitizeAdjustment("T[1]", "T[0]", "T[3]")', true);
  insertRule(2, '_ADJUSTMENT_ _EQUATE_ _NUMERIC_', '_NUMERIC_', 'T[2]');
  insertRule(2, '_ADJUSTMENT_ to', '_ADJUSTMENT_', 'T[0]');
  insertRule(2, '_OPERATOR_ _NUMERIC_ _ADJUSTMENT_ to', '_NUMERIC_',
      'T[0]T[1]');
  insertRule(2, '_NUMERIC_ _ATTACK_ROLLS_', '_CONDITION_', 'AttackT[0]');
  insertRule(2, '_NUMERIC_ _DEFENSE_', '_CONDITION_', 'T[1]T[0]');
  insertRule(2, '_NUMERIC_ as _ADJUSTMENT_ damage', '_CONDITION_', 'damageT[0]');
  insertRule(2, '_NUMERIC_ _SKILL_ checks', '_CONDITION_', 'T[1]T[0]');

  // Moves.
  // insertRule(2, 'a _DISTANCE_', '_DISTANCE_', 'T[1]');
  insertRule(2, '_MOVE_ _DISTANCE_', '_MOVE_',
      'augment(T[0], "distance", T[1])', true);
  insertRule(2, '_MOVE_TYPE_', '_MOVE_', '{type: "T[0]"}', true);
  insertRule(2, 'number of square _EQUATE_ _NUMERIC_', '_DISTANCE_', 'T[4]');
  insertRule(2, 'number of square up to _NUMERIC_', '_DISTANCE_', 'T[5]');
  insertRule(2, '_NUMERIC_ square', '_DISTANCE_', 'T[0]');
  insertRule(2, 'square _EQUATE_ _NUMERIC_', '_DISTANCE_', 'T[2]');
  insertRule(2, 'up to _DISTANCE_', '_DISTANCE_', 'T[2]');

  // Healing.
  insertRule(2, 'regain _ADJUSTMENT_ _HIT_POINTS_ _EQUATE_ _NUMERIC_', '_HEAL_',
      '{amount: "T[4]"}', true);
  insertRule(2, 'regain _NUMERIC_ _ADJUSTMENT_ _HIT_POINTS_', '_HEAL_',
      '{amount: "T[1]"}', true);
  insertRule(2, 'regain _NUMERIC_ _HIT_POINTS_', '_HEAL_', 
      '{amount: "T[1]"}', true);
  insertRule(2, 'regain _HIT_POINTS_ _EQUATE_ _NUMERIC_', '_HEAL_',
      '{amount: "T[3]"}', true);

  // Rules that attach actors to actions.
  insertRule(3, '_MOVE_ _ACTOR_', '_MOVE_', 'augment(T[0],"who", "T[1]")', true);
  insertRule(3, '_ACTOR_ _MOVE_', '_MOVE_', 'augment(T[1], "who", "T[0]")', true);
  insertRule(3, '_ACTOR_ _HEAL_', '_HEAL_', 'augment(T[1], "who", "T[0]")', true);
  insertRule(3, '_ACTOR_ _HEALING_SURGE_', '_HEALING_SURGE_', '{who: "T[0]"}', true);
  // TODO: Add actor to all effects to ensure the correct target.
 

  // Rules that are more vague are encoded here.  For example, the word
  // "distance" may be ommitted after the numeric value for the move.
  // Rules with a non-ambiguous stop token are expressed with higher
  // priority.
  insertRule(4, '_MOVE_ _NUMERIC_', '_MOVE_',
      'augment(T[0], "distance", "T[1]")', true);
  insertRule(4, 'damage _EQUATE_ _NUMERIC_', '_DAMAGE_', 
      '{amount: "T[2]", type: "untyped"}', true);
  insertRule(4, '_DAMAGE_TYPE_ _DAMAGE_', '_DAMAGE_',
      '{amount: extractValue(T[1],"amount"), type: "T[0]"}', true);
  insertRule(4, 'resist all _DAMAGE_', '_CONDITION_',
      '"ResistDamage"+extractValue(T[2],"amount")', true);
  insertRule(4, 'half _NUMERIC_', '_NUMERIC_', 'Math.floor(T[1]/2)', true);
  insertRule(4, 'twice _NUMERIC_', '_NUMERIC_', '2*T[1]', true);
  insertRule(4, '_OPERATOR_ _NUMERIC_ _ADJUSTMENT_', '_NUMERIC_', 'T[0]T[1]');
  insertRule(4, '_SKILL_ check to _MOVE_ with _NUMERIC_', '_MOVE_',
      'augment(T[3], "skillcheck", "T[0]T[5]")', true);

  // Power-up fragments that need to be aligned with previous statement.
  insertRule(4, '_NUMERIC_ _HIT_POINTS_', '_HIT_POINT_CHANGE_', 
      '{amount: "T[0]"}', true);
  insertRule(4, '_NUMERIC_ _ADJUSTMENT_ _HIT_POINTS_', '_HIT_POINT_CHANGE_', 
      '{amount: "T[0]"}', true);

  // Some monsters indicate special damage on a critical.
  insertRule(4, '( crit _NUMERIC_ )', '_CRIT_DAMAGE_', 'T[2]');
  insertRule(4, 'crit _DAMAGE_', '_CRIT_DAMAGE_', 'T[1]');

  // Save bonus.
  insertRule(4, '_SAVING_THROW_ with _ADJUSTMENT_', '_CONDITION_', 'saveT[2]');

  // Joiners.
  insertRule(5, '_COMBINE_ _COMBINE_', '_COMBINE_', 'T[1]');

  /**
   * Attempts to simplify a numeric expression. For example,
   * an expression of the form "stat + X" can simplify down
   * to a single number.
   * @param {string} expression to simplify.
   * @return {numeric|string} Simplified numerical value if possible,
   *     otherwise the unmodified expression.
   */
  function simplifyNumerics(expression) {
    if (typeof expression == 'number')
      return expression;
    var matches = expression.match(/([0-9]+[\+\-])*[0-9]+/);
    if (matches && matches.length > 0 && matches[0].length ==  expression.length) {
      var v;
      var expr = 'v = ' + expression;
      eval(expr);
      return v;
    }
    return expression;
  };

  /**
   * Determines if the level requirements are met to apply
   * tweaks to the power.
   * @param {number} level  The level requirement for the tweaks.
   * @return {boolean} Indicates if the tweaks should be applied.
   */
  function isReplacement(level) {
    if (characterInfo_) {
      var characterLevel = characterInfo_.stats['Level'];
      if (parseInt(characterLevel) > level) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extracts an attribute modifier for the character.
   * @param {string} attribute The name of the attribute.
   * @return {numeric} Value of the attribute modifier.
   */
  function getModifier(attribute) {
    if (characterInfo_) {
       var name = attribute.charAt(0).toUpperCase() + attribute.substring(1) + ' modifier';
       var value = characterInfo_.stats[name];
       return parseInt(value);
    }
    return '[' + attribute.substring(0, 3) + ']';
  }

  /**
   * Extracts the base damage of the weapon.
   * @return {string} Weapon damage expresses as a die roll.
   */
  function getWeaponDamage() {
    if (power_) {
      if (power_.weapons && power_.weapons.length > 0) {
        // TODO: Use weapon name and extract from inventory once parsed.
        //       For now, cheating by looking up resolved damage and extracting
        //       the relevant section.
        var dmgStr = power_.weapons[0].damage;
        if (!dmgStr)
          return '';
        var matches = dmgStr.match(/d[0-9]+/);
        if (matches && matches.length > 0)
          return matches[0];
      }
    }
    return '';
  }

  function extractValue(object, key) {
    return object[key];
  }

  /**
   * Adds or replaces an attribute within an object valued token.
   */
  function augment(object, key, value) {
     object[key] = value;
     return object;
  }

  /**
   * Ensure that attribute adjustments are in the the correct direction. The
   * phrases "takes a -X penalty to Y" and "penalty to Y is X" both imply a
   * negative effect even though the sign on the numeric value changes.
   */
  function sanitizeAdjustment(attribute, adjustment, value) {
    switch(adjustment) {
    case 'penalty':
      value = -Math.abs(value);
      break;
    case 'bonus':
      value = Math.abs(value);
    }
    var attr = attribute;
    if (attr == 'ac')
      attr = 'AC';
    else
      attr = attr.charAt(0).toUpperCase() + attr.substring(1);
    return  attr + value;
  }

  /**
   * Determines subject and object(s) of the sentence replacing tokens to
   * mark the "actors" participating in the execution of the power.
   */
  function extractActors(tokens) {
    var nameParts = {};
    var name = '';
    if (characterInfo_) {
      // Monster names typically consist of more than one word.
      // The power can refer to a subset of the full name when indicating
      // that the monster playing the role of subject or object in the
      // sentence.
      name = characterInfo_.name;
      var parts = name.toLowerCase().split(' ');
      for (var i = 0; i < parts.length; i++) {
        nameParts[parts[i]] = (i < parts.length - 1) ? parts[i + 1] : '';
      }
      if (name.indexOf('-') > 0) {
        parts = name.toLowerCase().replace(/\-/g, ' ').split(' ');
        for (var i = 0; i < parts.length; i++) {
          nameParts[parts[i]] = (i < parts.length - 1) ? parts[i + 1] : '';
        }
      }
    }

    var next = null;
    var actor = null;
    var consume = 0;

    // Test matching of the monster name or character class.
    var nameMatch = function(word) {
      if (typeof candidate != 'string')
        return false;
      if (word in nameParts) {
        if (!next || next == word) {
          actor = name;
          consume++;
          next = nameParts[candidate];
          return true;
        }
      } else if (candidate.indexOf('\'s') == candidate.length - 2) {
        // Possessive form.
        actor = name;
        consume++;
        return true;
      } else {
         // Check name synonyms.
         var synonyms = nameSynonyms[candidate];
         if (synonyms) {
           for (var i = 0; i < synonyms.length; i++) {
             if (nameMatch(synonyms[i]))
               return true;
           }
        }
      }
      return false;
    };

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (token == 'the') {
        // Start of a noun phrase commonly introducing a subject or object.
        next = null;
        actor = null;
        consume = 1;
        for (var j = i + 1; j < tokens.length; j++) {
          var candidate = tokens[j];
          if (!nameMatch(tokens[j]))
            break;
        }
        if (consume == 1) {
          if (i < tokens.length - 1) {
            var next = tokens[i+1];
            switch(next) {
            case 'target':
            case 'ally':
            case 'enemy':
              consume++;
              actor = next;
            }
          }
        }
        if (consume > 1)
          tokens.splice(i, consume, {type: '_ACTOR_', value: actor});
        else
          tokens.splice(i, consume);  
      } else {
        consume = 0;
        switch(token) {
        case 'a':
        case 'an':
        case 'any':
        case 'all':
        case 'each':
          if (i < tokens.length - 1) {
            switch(tokens[i+1]) {
            case 'ally':
            case 'allies':
            case 'enemy':
            case 'enemies':
            case 'target':
              consume = 2;
              tokens.splice(i, 2, {type: '_ACTOR_', value: tokens[i+1]});
              break;
            }
          }
        }
        if (!consume && (token == 'a' || token == 'an'))
          tokens.splice(i, 1);
      }
    }
  }



  /**
   * Parses a plain text description of a power into a script used to automate much
   * of the powers effects.
   * @param {Object} characterInfo  Details from the loaded character,
   *     which may be a player or monster.
   * @param {string} powerName The name of the power.
   */
  function generateScript(characterInfo, powerName) {
    if ('source' in characterInfo)
      characterInfo_ = characterInfo.source;
    else
      characterInfo_ = characterInfo;
    powers = characterInfo_.powers;
    for (var i = 0; i < powers.length; i++) {
      var candidate = powers[i];
      if (candidate.name == powerName) {
        power_ = candidate;
        break;
      }
    }
    // TODO(kellis): Parse targeting info.
    var script = '';
    var parseField = function(name, label) {
      var description = power_[name];
      if (description) {
        try {
          result = dungeon.LanguageParser.parseText(description);
          if (result.length > 0) {
            script += label + ':\n';
            script += '  ' + result.join(';\n  ') + ';\n';
          }
        } catch(err) {
          console.log('Error in language parser while processing ' + name);
          console.log(err.message);
        }
      }
    };
    parseField('Special', 'special');
    parseField('Hit', 'onHit');
    parseField('Effect', 'effect');
    parseField('Miss', 'onMiss');
    return script;
  }

  /**
   * Parses rules from a plain text description.
   * @param {string} text  Plain text description of the power of a portion thereof.
   * @return -- I'm working on it!
   */
  function parseText(text) {
    var result = [];
    //text = text.replace(/\[W\]/g, getWeaponDamage());
    var spacer = function(v) {
      return ' ' + v + ' ';
    }
    text = text.replace(/([,\(\)\+\-:\u2013\u2014])/g, spacer);
    var parts = text.split('.');
    for (var i = 0; i < parts.length; i++) {
      var tokens = parts[i].split(/[ \n]/);
      for (var j = 0; j < tokens.length; j++) {
        var token = tokens[j] = 
            tokens[j].toLowerCase().replace(/^\s+|\s+$/g,'');
        if (token in variants)
          token = tokens[j] = variants[token];
        if (token in primitives) {
          tokens[j] = {
            type: primitives[token],
            value: token
          }
        } else {
          for (var key in patterns) {
            var match = token.match(patterns[key]);
            if (match && match.length > 0) {
              if (match[0].length == token.length) {
                tokens[j] = {
                  type: key,
                  value: token
                };
                break;
              }
            }
          }
        }
      }
      // Extract participants in the ensuing action.
      extractActors(tokens);

      // Remove the non-informative filler.
      for (var j = tokens.length - 1; j >= 0; j--) {
        var token = tokens[j];
        if (typeof token == 'string')
          continue;
        if (token['type'] == '_FILLER_')
          tokens.splice(j, 1);
      }

      // Extract rules.
      parseExpressions(tokens);
      for(var j = 0; j < tokens.length; j++) {
        result.push(tokens[j]);
      }
    }
    console.log(debugString(result));
    return extractEffects(result);
  }

  /**
   * Parses rules for applying a power.
   * @param{Array.<string|Object> tokens List of tokens, which are
   *    modified in place to refine the expression and extract rules.
   * @param{numeric=} opt_rulesetIndex Optional index to specify which
   *     ruleset to apply.  Start with the highest priority rules by
   *     default.
   */
  function parseExpressions(tokens, opt_rulesetIndex) {

    var rulesetIndex = opt_rulesetIndex | 0;
    if (rulesetIndex >= rulesets.length)
      return;

    var rules = rulesets[rulesetIndex];

    var ruleApplied = false;
    var index = 0;
    while (index < tokens.length) {
      var replacement = null;
      var consume = 0; // number of tokens to remove from the list.
      var token = tokens[index];
      var T = [token];
      var start = index;
      var key = (typeof token == 'string') ? token : token.type;
      if (key == 'if' || key == 'when') {
        // Currently don't handle conditionals.
        // rewind back to last "joiner" and flush remaining tokens.
        for (var i = index - 1; i >= 0; i--) {
          var candidate = tokens[i];
          if (i == 0 || (typeof candidate != 'string' && candidate.type == '_COMBINE_')) {
            tokens.splice(i, tokens.length - 1);
            break;
          } 
        }
      }
      var r = rules[key];
      while (r) {
        if ('_terminal_' in r) {
          ruleApplied = true;
          consume++;
          if (typeof r['_terminal_'] == 'string') {
            tokens.splice(start, consume, r['_terminal_']);
            break;
          }
          var replacement = {
            type: r['_terminal_'].type,
            value: r['_terminal_'].value
          };
          var subs = function(m) {
            var value = T[m[2]].value;
            var toString = function(v) {
              if (v instanceof Array) {
                var parts = [];
                for (var i = 0; i < v.length; i++) {
                  parts.push(toString(v[i]));
                }
                return '[' + parts.join(', ') + ']';
              } else if (v instanceof Object) {
                var parts = [];
                for (var key in v) {
                  parts.push(key + ': \'' + toString(v[key]) + '\'');
                }
                return '{' + parts.join(', ') + '}';
              }
              return v;
            }
            return toString(value);
          };
          // Substitute tokens.
          var v = replacement.value.replace(/T\[([0-9])\]/g, subs);
          if (r['_terminal_'].evaluate) {
            var expr = 'v = ' + v;
            eval(expr);
          }
          replacement.value = v;
          tokens.splice(start, consume, replacement);
          break;
        }
        token = tokens[++index];
        if (!token) {
          consume = 0;
          break;
        }
        T.push(token);
        key = (typeof token == 'string') ? token : token.type;
        r = r[key];
        consume++;
      }
      if (ruleApplied)
        break;
      index = start + 1;
    }
    if (ruleApplied)
      parseExpressions(tokens, 0);
    else
      parseExpressions(tokens, rulesetIndex + 1);
  }

  /**
   * Extracts effects for use in script generation.
   * @param {Array<string|Object} tokens List of tokens in
   *     the processd expression.
   */
  function extractEffects(tokens) {
    var effects = [];
    var replacementRules = false;
    var replacementIndex = undefined;
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (typeof token == 'string')
        continue;
      var type = token.type;
      // Are rules for higher level characters.
      if (type == '_LEVEL_POWER_UP_') {
        if (token.value == false) {
          break;
        } else {
          replacementRules = true;
          replacementIndex = effects.length;
          continue;
        }
      }
      switch(type) {
        case '_DAMAGE_':
        case '_ONGOING_DAMAGE_':
          extractDamageEffect(token, effects);
          break;
        case '_HALF_DAMAGE_':
          effects.push('HalfDamage(target)');
          break;
        case '_MOVE_':
          extractMoveEffect(token, effects);
          break;
        case '_CONDITION_':
        case '_REMOVE_CONDITION_':
          extractConditionEffect(token, effects);
          break;
        case '_HEALING_SURGE_':
        case '_HEAL_':
        case '_HIT_POINT_CHANGE_':
          extractHealEffect(token, effects);
          break;
      }
    }
    return pruneEffects(effects, replacementIndex);
  }

  /**
   * Extract immediate or ongoing damage effects.
   * @param {{type: string, {amount: string, type: string}} damage
   *     Description of the damage.
   * @param {Array.<Object>} effects List for collecting effects.
   */
  function extractDamageEffect(damage, effects) {
    if (damage.value instanceof Array) {    
      for (var i = 0; i < damage.value.length; i++) {
        var dmg = {
          type: damage.type,
          value: damage.value[i]
        };
        extractDamageEffect(dmg, effects);
      }
    } else {
      var value = damage.value;
      var effect = 'Damage(target, "' + value.amount + '", "' +
          value.type + '")'

      if (damage.type == '_ONGOING_DAMAGE_') {
        effect = 'Ongoing(' + effect +')';
      }
      var value = damage.value;
      effects.push(effect);
    }
  }

  function extractHealEffect(token, effects) {
    var value = token.value;
    var amount = value && value.amount ? value.amount : null;
    var who = value && value.who ? value.who : 'target';
    if (who != 'target')
      who = '"' + who + '"';
    if (token.type == '_HEALING_SURGE_')
      effects.push('HealingSurge(' + who + ')');
    else
      effects.push('Heal(' + who + ', "' + amount + '")');
  }

  /**
   * Extracts a move effect.  Assumes forced moves are applied to the target and
   * non-forced are applied to the source creature. TODO: handle case where a non-
   * forced move is applied to an ally, or forced moves are applied to the target's
   * allies.
   */
  function extractMoveEffect(move, effects) {
    var value = move.value;

    if (!value.distance && value.type != 'jump' && value.type != 'shift')
      return;
    var default_target = 'target';
    switch(value.type) {
      case 'teleport':
      case 'fly':
      case 'move':
      case 'run':
      case 'shift':
      case 'jump':
        default_target = characterInfo_.name;
    }
    var target = value.who ? value.who : default_target;
    if (target != 'target')
      target = '"' + target + '"';
    var effect = 'Move(' + target + ', "' + value.type + '"';
    if (value.distance)
      effect +=  ', "' + value.distance + '"';
    effect += ')';
    if (value.skillcheck)
      effect = 'SkillCheck(' + effect + ', "' + value.skillcheck + '")';
    effects.push(effect);
  }

  /**
   * Extracts a condition type effect.  Assumes beneficial conditions are applied to
   * source creature, and detrimental ones are applied to the target.  TODO: Handle 
   * potential target mixup.  TODO: Missing duration
   */
  function extractConditionEffect(condition, effects) {
    var value = condition.value;
    var target = 'target';
    switch(value) {
      case 'bloodied':
      case 'concealed':
      case 'invisible':
        target = '"' + characterInfo_.name + '"'
    }
    if (power_ && power_['Attack Type'] == 'Personal')
      target = '"' + characterInfo_.name + '"'

    var fn = condition.type == '_CONDITION_' ? 'ApplyCondition' : 'RemoveCondition';
    var effect = fn + '(' + target + ', "' + value + '")';
    effects.push(effect);
  }

  /**
   * Prunes effects by pruning exact duplicates and applying powerups
   * due to character level.  Exact duplicates results from an effect
   * being mention multiple times and being taking out of context.
   * @param {Array.<string>} effects  The list of effects.
   * @param {number} replacementIndex Starting index for powerup effects
   *     that replace effects of a lower-level character. 
   */
  function pruneEffects(effects, replacementIndex) {
     var map = {};
     for(var i = 0; i < effects.length; i++) {
       var effect = effects[i];
       if (effect in map)
         delete effects[i];
       else
         map[effect] = i;
     }
     if (replacementIndex) {
       for (var i = replacementIndex; i < effects.length; i++) {
         var effect = effects[i];
         if (effect) {
           // find nearest match to replace.
           var bestScore;
           var bestMatch;
           var bestIndex;
           for (var j = 0; j < replacementIndex; j++) {
             var candidate = effects[j];
             if (candidate) {
               var score = closeness(effect, candidate);
               if (!bestMatch || score < bestScore) {
                  bestMatch = candidate;
                  bestScore = score;
                  bestIndex = j;
               }
             }
           }
           if (bestMatch) {
              effects[bestIndex] = effect;
           }
         }
         delete effects[i];
       }
     }
     var trimmedEffects = [];
     for (var i = 0; i < effects.length; i++) {
       var effect = effects[i];
       if (effect)
         trimmedEffects.push(effect);
     }
     return trimmedEffects;
  }

  /**
   * Determine how similar two strings are.  Current scoring is naive requiring
   * that the target and candidate be of the same length.  Relax this requirement
   * as needed.
   * @param {string} target  The reference string being compared to.
   * @param {string} candidate  The string being tested.
   * @return {number} A measure of the difference between the strings.
   */
  function closeness(target, candidate) {
    var score = 0;
    if (target.length == candidate.length) {
      for (var i = 0; i < target.length; i++) {
        if (target.charAt(i) != candidate.charAt(i))
          score++;
      }
    } else {
      score = Math.max(target.length, candidate.length);
    }
    return score;
  }

  /**
   * Generate a string useful for debugging the parser.
   * @param {Array<string|Object>} tokens List of tokens in
   *     the processed expression.
   */
  function debugString(tokens) {
    var output = [];
    for(var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (typeof token == 'string') {
        output.push(token);
      } else {
        var obj = [];
        for (var key in token) {
          var value = token[key];
          if (value instanceof Object)
            value = debugString([value]);
          obj.push(key + ': \'' + value + '\'');
        }
        output.push('{' + obj.join(', ') + '}');
      }
    }
    return output.join(' ');
  }

  return {
    generateScript: generateScript,
    parseText: parseText
  };
   
})();

