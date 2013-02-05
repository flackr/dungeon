dungeon.ParseMonster = (function() {

  var STAT_LIST = [
    'Level',
    'HitPoints:Hit Points',
    'ActionPoints',
    'Initiative',
    'Speed', // TODO(kellis): Will be more than one value for flying creatures.
  ];

  var aliasMap_ = {
    'Standard': 'Standard Action',
    'standard': 'Standard Action',
    'At-Will': 'At-Will Action',
    'Free': 'Free Action',
    'free': 'Free Action',
    'Minor': 'Minor Action',
    'minor': 'Minor Action',
    'Move': 'Move Action',
    'move': 'Move Action',
  };

  function parseMonster_(xmlDoc) {
    var abilities = xmlDoc.getElementsByTagName('AbilityScoreNumber');
    var stats = {};
    var attributes = [];

    for (var i = 0; i < abilities.length; i++) {
      var ability = abilities[i];
      var name = extractBasicAttribute_(ability, 'Name');
      var value = ability.getAttribute('FinalValue');
      attributes.push(name);
      stats[name] = value;
    }

    // TODO(kellis): Can get rid of level and charClass outside of stats block.
    stats['Class'] = 'Monster';

    // Extract miscellaneous assortment of stats.
    for (var i = 0; i < STAT_LIST.length; i++)
      extractStat_(xmlDoc, STAT_LIST[i], stats);

    // Extract skills.
    var skillElements = xmlDoc.getElementsByTagName('SkillNumber');
    var skills = [];
    for (var i = 0; i < skillElements.length; i++) {
      var el = skillElements[i];
      var name = extractBasicAttribute_(el, 'Name');
      var value = el.getAttribute('FinalValue');
      skills.push(name);
      stats[name] = value;
    }

    // Extract Defenses.
    var defenses = xmlDoc.getElementsByTagName('Defenses')[0];
    var defenseValues = defenses.getElementsByTagName('SimpleAdjustableNumber');
    for (var i = 0; i < defenseValues.length; i++) {
      var el = defenseValues[i];
      var name = extractBasicAttribute_(el, 'Name');
      var value = el.getAttribute('FinalValue');
      skills.push(name);
      stats[name] = value;
    }

    var size = xmlDoc.getElementsByTagName('Size')[0];
    stats['Size'] = extractBasicAttribute_(size, 'Name');

    // Add derived stats that are not part of the XML save format.
    var hp = Number(stats['Hit Points']);
    stats['Bloodied'] = Math.floor(hp/2);
    stats['Surge Amount'] = Math.floor(hp/4);
    stats['Passive Insight'] = Number(stats['Insight']) + 10;
    stats['Passive Perception'] = Number(stats['Perception']) + 10;
    stats['Healing Surges'] = 0;

    var json = {
       level: stats['Level'],
       charClass: 'Monster',
       stats: stats, // (name,value) set of all character stats (includes aliases).
       attributes: attributes, // List of ability/attribute names.
       skills: skills,
       defenses: ['AC', 'Fortitude', 'Reflex', 'Will'],
       health: ['Hit Points', 'Bloodied', 'Surge Amount', 'Healing Surges'],
       other: ['Name', 'Class', 'Level', 'Power Source', 'Initiative', 'Speed', 
               'Passive Perception', 'Passive Insight', 'Size'],
       powers: extractPowers_(xmlDoc)
    };
    return json;
  }

  function extractStat_(el, name, stats) {
    var alias = name;
    var index = name.indexOf(':');
    if (index > 0) {
       alias = name.substring(index + 1);
       name = name.substring(0,index);
    }
    var match = el.getElementsByTagName(name)[0];
    if (match) {
      var value = match.getAttribute('FinalValue');
      if (!value)
        value = match.textContent;
      stats[alias] = value;
    }
  }

  function extractBasicAttribute_(el, tag) {
    var match = el.getElementsByTagName(tag)[0];
    if (match)
      return match.textContent;
  }

  function findAncestor_(el, tag) {
    while(el) {
      var parent = el.parentNode;
      if (parent && parent.tagName == tag)
        return parent;
      el = parent;
    }
  }

  /**
   * Extract all description snippets for a power except for keyword descriptions.
   */
  function extractDescription_(el) {
    var matches = el.getElementsByTagName('Description');
    if (matches) {
      var value = [];
      for (var i = 0; i < matches.length; i++) {
        var match = matches[i];
        if (!findAncestor_(match, 'Keywords'))
          value.push(matches[i].textContent);
      }
      return value.join('\n\n');
    }
  }

  function extractValueFromChild_(el, tag) {
    var list = el.childNodes;
    for (var i = 0; i < list.length; i++) {
      if (list[i].nodeName == tag)
        return list[i].textContent;
    }
  }

  function extractPowers_(xmlDoc, stats) {
    var powers = [];

    var extractor = function(el, name) {
      var match = el.getElementsByTagName(name)[0];
      if (match) {
        var value = match.getAttribute('FinalValue');
        if (!value)
          value = match.textContent;
        return value;
      }
    }

    var powerList = xmlDoc.getElementsByTagName('MonsterPower');
    for (var i = 0; i < powerList.length; i++) {
      var power = powerList[i];
      var data = {};
      var type = extractBasicAttribute_(power, 'Action');
      var usage = extractBasicAttribute_(power, 'Usage');
      var range = extractBasicAttribute_(power, 'Range');
      var trigger = extractBasicAttribute_(power, 'Trigger');
      var targets = extractBasicAttribute_(power, 'Targets');
      var usageDetails = extractBasicAttribute_(power, 'UsageDetails');
      if (type in aliasMap_)
        type = aliasMap_[type];
      // TODO(kellis): Investigate suitable defaults for missing properties.
      if (!type)
        type = 'Standard Action';
      if (!usage)
        usage = 'Encounter';
      data['Action Type'] = type;
      data['Power Usage'] = usage;
      if (range)
        data['Range'] = range;
      if (trigger)
        data['Trigger'] = trigger;
      if (targets)
        data['Targets'] = targets;
      if (usage == 'Recharge' && usageDetails)
        data['Recharge'] = usageDetails;
      data.name = extractValueFromChild_(power, 'Name');

      var attack = {};
      var attackBonuses = power.getElementsByTagName('AttackBonuses')[0];
      attack.toHit = extractor(attackBonuses, 'MonsterPowerAttackNumber');
      attack.defense = extractor(attackBonuses, 'DefenseName');
      attack.name = '';

      // TODO(kellis): This is a bit of a hack.
      if (attack.toHit)
        data.weapons = [attack];

      var hit = power.getElementsByTagName('Hit')[0];
      if (hit) {
        var damage = extractor(hit, 'Expression');
        var onHit = [];
        var description = extractor(hit, 'Description');
        if (description && description.length > 0) {
          // Damage apears to be bogus unless accompanied by a description.
          if (damage) {
            attack.damage = damage;
            onHit.push(damage);
          }
          onHit.push(description);
        }     
        var effects =  power.getElementsByTagName('Effect');
        for (var j = 0; j < effects.length; j++) {
          description = extractor(effects[j], 'Description');
          if (description && description.length > 0)
            onHit.push(description);
        }
        if (onHit.length > 0)
          data['Hit Effects'] = onHit.join(' ');
      }

      var miss = power.getElementsByTagName('Miss')[0];
      if (miss) {
        var missDamage = extractor(miss, 'Expression');
        var onMiss = [];
        if (missDamage)
          onMiss.push(missDamage);
        var description = extractor(miss, 'Description');
        if (description && description.length > 0)
          onMiss.push(description);
        if (onMiss.length > 0)
          data['Miss Effects'] = onMiss.join(' ');       
      }
     
      powers.push(data);
    }
    return powers;
  }

  return parseMonster_;

})();

