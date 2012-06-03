dungeon.ParseMonster = (function() {

  var STAT_LIST = [
    'Level',
    'HitPoints:Hit Points',
    'ActionPoints',
    'Initiative',
    'Speed', // TODO(kellis): Will be more than one value for flying creatures.
  ];

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
       //racialTraits: [],
       //classFeatures: [],
       powers: []
       //powers: extractPowers_(characterSheet, rules)
    };
    return json;
  }

  function extractStat_(xmlDoc, name, stats) {
    var alias = name;
    var index = name.indexOf(':');
    if (index > 0) {
       alias = name.substring(index + 1);
       name = name.substring(0,index);
    }
    var match = xmlDoc.getElementsByTagName(name)[0];
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

  return parseMonster_;

})();

